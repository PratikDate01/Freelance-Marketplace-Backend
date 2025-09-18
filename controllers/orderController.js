const Order = require("../models/Order");
const Gig = require("../models/Gig");
const User = require("../models/User");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

// Create a new order
const createOrder = async (req, res) => {
  try {
    console.log("Creating order with request body:", req.body);
    console.log("User ID from token:", req.user.id);
    
    const { gigId, requirements, packageType = "basic" } = req.body;
    const buyerId = req.user.id;

    // Fetch gig details
    const gig = await Gig.findById(gigId).populate("sellerId", "name email");
    if (!gig) {
      console.log("Gig not found with ID:", gigId);
      return res.status(404).json({ message: "Gig not found" });
    }
    
    console.log("Found gig:", gig.title);

    // Prevent self-ordering
    if (gig.sellerId._id.toString() === buyerId) {
      return res.status(400).json({ message: "You cannot order your own gig" });
    }

    // Calculate pricing in USD (convert from INR) and apply 5% service fee
    const inrToUsd = parseFloat(process.env.INR_TO_USD || '0.012');
    const amount = Math.round(gig.price * inrToUsd); // USD amount
    const serviceFee = Math.round(amount * 0.05); // 5% service fee in USD
    const totalAmount = amount + serviceFee; // Total in USD

    // Calculate delivery date
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + gig.deliveryTime);

    // Create order
    const order = new Order({
      gigId,
      buyerId,
      sellerId: gig.sellerId._id,
      gigTitle: gig.title,
      gigImage: gig.image,
      packageType,
      amount,
      serviceFee,
      totalAmount,
      deliveryTime: gig.deliveryTime,
      deliveryDate,
      requirements: requirements || "",
      status: "pending",
      paymentStatus: "pending",
      statusHistory: [{
        status: "pending",
        note: "Order created and awaiting payment"
      }]
    });

    await order.save();

    // Populate the order for response
    const populatedOrder = await Order.findById(order._id)
      .populate("gigId", "title image price")
      .populate("buyerId", "name email")
      .populate("sellerId", "name email");

    res.status(201).json({
      message: "Order created successfully",
      order: populatedOrder
    });

  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ message: "Failed to create order" });
  }
};

// Legacy payment processing (kept for backward compatibility)
const processPayment = async (req, res) => {
  try {
    console.log("⚠️ Using legacy payment processing. Consider using Stripe integration.");
    
    const { id: orderId } = req.params;
    const { paymentMethod = "card" } = req.body;
    const buyerId = req.user.id;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Verify buyer
    if (order.buyerId.toString() !== buyerId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Check if already paid
    if (order.paymentStatus === "paid") {
      return res.status(400).json({ message: "Order already paid" });
    }

    // Simulate payment processing (for demo purposes)
    order.paymentStatus = "paid";
    order.status = "active";
    order.paymentMethod = paymentMethod;
    order.statusHistory.push({
      status: "active",
      note: "Payment processed successfully. Order is now active."
    });

    // Add system message
    order.messages.push({
      sender: order.sellerId,
      message: `Great! Your order is now active. I'll start working on it right away and deliver within ${order.deliveryTime} days.`,
      isSystem: true
    });

    await order.save();

    const populatedOrder = await Order.findById(order._id)
      .populate("gigId", "title image price")
      .populate("buyerId", "name email")
      .populate("sellerId", "name email");

    // Emit real-time update
    if (global.io) {
      global.io.to(`user_${order.sellerId}`).emit('order_status_update', {
        orderId: order._id,
        status: 'active',
        message: 'New order received! Payment confirmed.'
      });
      global.io.to(`order_${order._id}`).emit('order_activated', populatedOrder);
    }

    res.json({
      message: "Payment processed successfully",
      order: populatedOrder
    });

  } catch (error) {
    console.error("Error processing payment:", error);
    res.status(500).json({ message: "Failed to process payment" });
  }
};

// Get buyer's orders
const getBuyerOrders = async (req, res) => {
  try {
    const buyerId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;

    const query = { buyerId };
    if (status) query.status = status;

    const orders = await Order.find(query)
      .populate("gigId", "title image price category")
      .populate("sellerId", "name email avatar")
      .populate("messages.sender", "name")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Order.countDocuments(query);

    res.json({
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });

  } catch (error) {
    console.error("Error fetching buyer orders:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

// Get seller's orders
const getSellerOrders = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;

    const query = { sellerId };
    if (status) query.status = status;

    const orders = await Order.find(query)
      .populate("gigId", "title image price category")
      .populate("buyerId", "name email avatar")
      .populate("messages.sender", "name")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Order.countDocuments(query);

    res.json({
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });

  } catch (error) {
    console.error("Error fetching seller orders:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

// Get single order details
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const order = await Order.findById(id)
      .populate("gigId", "title image price category description")
      .populate("buyerId", "name email avatar")
      .populate("sellerId", "name email avatar")
      .populate("messages.sender", "name");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if user is buyer or seller
    if (order.buyerId._id.toString() !== userId && order.sellerId._id.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    res.json(order);

  } catch (error) {
    console.error("Error fetching order:", error);
    res.status(500).json({ message: "Failed to fetch order" });
  }
};

// Deliver order (seller)
const deliverOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { deliveryNote, deliveryFiles = [] } = req.body;
    const sellerId = req.user.id;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Verify seller
    if (order.sellerId.toString() !== sellerId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Check if order is active or in revision
    if (order.status !== "active" && order.status !== "revision") {
      return res.status(400).json({ message: "Order is not active or in revision" });
    }

    const isRevisionDelivery = order.status === "revision";

    // Update order
    order.status = "delivered";
    order.deliveryNote = deliveryNote;
    order.deliveryFiles = deliveryFiles;
    
    const statusNote = isRevisionDelivery 
      ? `Revision delivered by seller (${order.revisionCount}/${order.maxRevisions})`
      : "Order delivered by seller";
    
    order.statusHistory.push({
      status: "delivered",
      note: statusNote
    });

    // Add delivery message
    const messageText = isRevisionDelivery
      ? `I've submitted the revision as requested! ${deliveryNote}`
      : `I've delivered your order! ${deliveryNote}`;
      
    order.messages.push({
      sender: sellerId,
      message: messageText,
      isSystem: false
    });

    await order.save();

    const populatedOrder = await Order.findById(order._id)
      .populate("gigId", "title image price")
      .populate("buyerId", "name email")
      .populate("sellerId", "name email");

    // Emit real-time update
    if (global.io) {
      global.io.to(`user_${order.buyerId}`).emit('order_status_update', {
        orderId: order._id,
        status: 'delivered',
        message: 'Your order has been delivered!'
      });
      global.io.to(`order_${order._id}`).emit('order_delivered', populatedOrder);
    }

    res.json({
      message: "Order delivered successfully",
      order: populatedOrder
    });

  } catch (error) {
    console.error("Error delivering order:", error);
    res.status(500).json({ message: "Failed to deliver order" });
  }
};

// Accept delivery (buyer)
const acceptDelivery = async (req, res) => {
  try {
    const { id } = req.params;
    const buyerId = req.user.id;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Verify buyer
    if (order.buyerId.toString() !== buyerId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Check if order is delivered
    if (order.status !== "delivered") {
      return res.status(400).json({ message: "Order is not delivered yet" });
    }

    // Complete order
    order.status = "completed";
    order.paymentStatus = "released";
    order.statusHistory.push({
      status: "completed",
      note: "Order completed and payment released"
    });

    // Add completion message
    order.messages.push({
      sender: buyerId,
      message: "Thank you! I'm satisfied with the delivery. Order completed.",
      isSystem: false
    });

    await order.save();

    // TODO: Integrate with payment release functionality
    // For now, the payment status is updated to "released" in the database
    // The actual Stripe payment release should be handled separately

    const populatedOrder = await Order.findById(order._id)
      .populate("gigId", "title image price")
      .populate("buyerId", "name email")
      .populate("sellerId", "name email");

    // Emit real-time update
    if (global.io) {
      global.io.to(`user_${order.sellerId}`).emit('order_status_update', {
        orderId: order._id,
        status: 'completed',
        message: 'Your order has been completed and payment released!'
      });
      global.io.to(`order_${order._id}`).emit('order_completed', populatedOrder);
    }

    res.json({
      message: "Order completed successfully",
      order: populatedOrder
    });

  } catch (error) {
    console.error("Error accepting delivery:", error);
    res.status(500).json({ message: "Failed to accept delivery" });
  }
};

// Request revision (buyer)
const requestRevision = async (req, res) => {
  try {
    const { id } = req.params;
    const { revisionNote } = req.body;
    const buyerId = req.user.id;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Verify buyer
    if (order.buyerId.toString() !== buyerId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Check if order is delivered
    if (order.status !== "delivered") {
      return res.status(400).json({ message: "Order is not delivered yet" });
    }

    // Check revision limit
    if (order.revisionCount >= order.maxRevisions) {
      return res.status(400).json({ message: "Maximum revisions exceeded" });
    }

    // Request revision
    order.status = "revision";
    order.revisionCount += 1;
    order.statusHistory.push({
      status: "revision",
      note: `Revision requested (${order.revisionCount}/${order.maxRevisions})`
    });

    // Add revision message
    order.messages.push({
      sender: buyerId,
      message: `I need some revisions: ${revisionNote}`,
      isSystem: false
    });

    await order.save();

    const populatedOrder = await Order.findById(order._id)
      .populate("gigId", "title image price")
      .populate("buyerId", "name email")
      .populate("sellerId", "name email");

    res.json({
      message: "Revision requested successfully",
      order: populatedOrder
    });

  } catch (error) {
    console.error("Error requesting revision:", error);
    res.status(500).json({ message: "Failed to request revision" });
  }
};

// Add message to order
const addMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const userId = req.user.id;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if user is buyer or seller
    if (order.buyerId.toString() !== userId && order.sellerId.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Add message to order (for backward compatibility)
    order.messages.push({
      sender: userId,
      message,
      isSystem: false
    });

    await order.save();

    // Also create/update conversation for the main messages page
    let conversation = await Conversation.findOne({
      participants: { $all: [order.buyerId, order.sellerId] },
      orderId: order._id
    });

    if (!conversation) {
      // Create new conversation for this order
      conversation = new Conversation({
        participants: [order.buyerId, order.sellerId],
        orderId: order._id,
        type: 'order',
        unreadCount: [
          { userId: order.buyerId, count: userId === order.buyerId.toString() ? 0 : 1 },
          { userId: order.sellerId, count: userId === order.sellerId.toString() ? 0 : 1 }
        ]
      });
      await conversation.save();
    }

    // Create message in the chat system
    const chatMessage = new Message({
      conversationId: conversation._id,
      sender: userId,
      content: message,
      messageType: 'text'
    });
    await chatMessage.save();

    // Update conversation's last message
    conversation.lastMessage = {
      content: message,
      sender: userId,
      timestamp: new Date(),
      messageType: 'text'
    };

    // Update unread count for the other participant
    const otherParticipantId = userId === order.buyerId.toString() ? order.sellerId : order.buyerId;
    const unreadIndex = conversation.unreadCount.findIndex(uc => uc.userId.toString() === otherParticipantId.toString());
    if (unreadIndex !== -1) {
      conversation.unreadCount[unreadIndex].count += 1;
    }

    await conversation.save();

    const populatedOrder = await Order.findById(order._id)
      .populate("messages.sender", "name");

    // Populate the chat message for real-time emission
    await chatMessage.populate('sender', 'name profilePicture avatar');

    // Emit real-time message to both order room and conversation room
    const newMessage = populatedOrder.messages[populatedOrder.messages.length - 1];
    console.log('🔔 Emitting new message to order room:', `order_${id}`, newMessage);
    
    if (global.io) {
      // Emit to order room (for order pages)
      global.io.to(`order_${id}`).emit('new_order_message', {
        orderId: id,
        message: newMessage
      });

      // Emit to conversation room (for main messages page)
      global.io.to(`conversation_${conversation._id}`).emit('new_message', {
        ...chatMessage.toObject(),
        conversationId: conversation._id
      });

      // Notify participants individually
      [order.buyerId, order.sellerId].forEach(participantId => {
        if (participantId.toString() !== userId) {
          const unreadCount = conversation.unreadCount.find(uc => uc.userId.toString() === participantId.toString())?.count || 0;
          
          global.io.to(`user_${participantId}`).emit('conversation_updated', {
            conversationId: conversation._id,
            lastMessage: conversation.lastMessage,
            unreadCount: unreadCount
          });
        }
      });

      console.log('✅ Messages emitted successfully');
    } else {
      console.log('❌ Socket.IO not available');
    }

    res.json({
      message: "Message added successfully",
      messages: populatedOrder.messages
    });

  } catch (error) {
    console.error("Error adding message:", error);
    res.status(500).json({ message: "Failed to add message" });
  }
};

// Cancel order
const cancelOrder = async (req, res) => {
  try {
    console.log("=== CANCEL ORDER DEBUG ===");
    console.log("Order ID:", req.params.id);
    console.log("User ID:", req.user.id);
    console.log("Request body:", req.body);
    
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    const order = await Order.findById(id);
    console.log("Found order:", order ? order._id : "NOT FOUND");
    
    if (!order) {
      console.log("Order not found with ID:", id);
      return res.status(404).json({ message: "Order not found" });
    }

    console.log("Order status:", order.status);
    console.log("Order buyerId:", order.buyerId.toString());
    console.log("Order sellerId:", order.sellerId.toString());
    console.log("Current userId:", userId);

    // Check if user is buyer or seller
    if (order.buyerId.toString() !== userId && order.sellerId.toString() !== userId) {
      console.log("Unauthorized: User is neither buyer nor seller");
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Check if order can be cancelled
    if (order.status === "completed" || order.status === "cancelled") {
      console.log("Order cannot be cancelled, current status:", order.status);
      return res.status(400).json({ message: "Order cannot be cancelled" });
    }

    console.log("Proceeding with cancellation...");

    // Cancel order - only update necessary fields
    const updateData = {
      status: "cancelled",
      paymentStatus: "refunded",
      $push: {
        statusHistory: {
          status: "cancelled",
          note: reason || "Order cancelled",
          timestamp: new Date()
        },
        messages: {
          sender: userId,
          message: `Order cancelled. Reason: ${reason || "No reason provided"}`,
          timestamp: new Date(),
          isSystem: true
        }
      }
    };

    await Order.findByIdAndUpdate(id, updateData, { 
      new: true,
      runValidators: false // Skip validation for cancellation
    });
    console.log("Order saved successfully");

    const populatedOrder = await Order.findById(order._id)
      .populate("gigId", "title image price")
      .populate("buyerId", "name email")
      .populate("sellerId", "name email");

    console.log("Order cancelled successfully");
    res.json({
      message: "Order cancelled successfully",
      order: populatedOrder
    });

  } catch (error) {
    console.error("Error cancelling order:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({ 
      message: "Failed to cancel order",
      error: error.message 
    });
  }
};

// Get buyer statistics
const getBuyerStats = async (req, res) => {
  try {
    const buyerId = req.user.id;

    // Get all orders for the buyer
    const orders = await Order.find({ buyerId });

    // Calculate statistics
    const stats = {
      totalOrders: orders.length,
      activeOrders: orders.filter(order => ['pending', 'active', 'delivered'].includes(order.status)).length,
      completedOrders: orders.filter(order => order.status === 'completed').length,
      cancelledOrders: orders.filter(order => order.status === 'cancelled').length,
      totalSpent: orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0),
      reviewsGiven: 0, // TODO: Implement reviews count
      savedGigs: 0 // TODO: Implement saved gigs count
    };

    // Get recent activity (last 10 orders)
    const recentOrders = await Order.find({ buyerId })
      .populate('gigId', 'title image')
      .populate('sellerId', 'name')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      ...stats,
      recentOrders
    });

  } catch (error) {
    console.error('Error fetching buyer stats:', error);
    res.status(500).json({ message: 'Failed to fetch buyer statistics' });
  }
};

// Get seller statistics
const getSellerStats = async (req, res) => {
  try {
    const sellerId = req.user.id;

    // Get all orders for the seller
    const orders = await Order.find({ sellerId });

    // Calculate statistics
    const stats = {
      totalOrders: orders.length,
      activeOrders: orders.filter(order => ['pending', 'active', 'delivered'].includes(order.status)).length,
      completedOrders: orders.filter(order => order.status === 'completed').length,
      cancelledOrders: orders.filter(order => order.status === 'cancelled').length,
      totalEarnings: orders.filter(order => order.status === 'completed').reduce((sum, order) => sum + (order.amount || 0), 0),
      pendingEarnings: orders.filter(order => ['active', 'delivered'].includes(order.status)).reduce((sum, order) => sum + (order.amount || 0), 0),
      averageRating: 4.8, // TODO: Calculate from reviews
      responseTime: '2 hours' // TODO: Calculate actual response time
    };

    // Get recent activity (last 10 orders)
    const recentOrders = await Order.find({ sellerId })
      .populate('gigId', 'title image')
      .populate('buyerId', 'name')
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      ...stats,
      recentOrders
    });

  } catch (error) {
    console.error('Error fetching seller stats:', error);
    res.status(500).json({ message: 'Failed to fetch seller statistics' });
  }
};

module.exports = {
  createOrder,
  processPayment,
  getBuyerOrders,
  getBuyerStats,
  getSellerOrders,
  getSellerStats,
  getOrderById,
  deliverOrder,
  acceptDelivery,
  requestRevision,
  addMessage,
  cancelOrder
};