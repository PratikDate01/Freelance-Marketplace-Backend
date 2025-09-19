const stripe = require('../config/stripe');
const Order = require('../models/Order');
const User = require('../models/User');
const Gig = require('../models/Gig');

// Create Payment Intent (Escrow Payment)
const createPaymentIntent = async (req, res) => {
  try {
    const { orderId } = req.body;
    const buyerId = req.user.id;

    // Get order details
    const order = await Order.findById(orderId)
      .populate('sellerId', 'name email stripeAccountId')
      .populate('gigId', 'title');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Verify buyer
    if (order.buyerId.toString() !== buyerId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Check if already paid
    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ message: 'Order already paid' });
    }

    // Calculate amounts
    const totalAmount = order.totalAmount * 100; // Convert to cents
    const platformFee = Math.round(order.amount * 0.05 * 100); // 5% platform fee
    const sellerAmount = (order.amount * 100) - platformFee; // Seller gets 95%

    // Create Payment Intent with automatic payment methods
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        orderId: orderId,
        buyerId: buyerId,
        sellerId: order.sellerId._id.toString(),
        sellerAmount: sellerAmount.toString(),
        platformFee: platformFee.toString(),
        gigTitle: order.gigId.title
      },
      description: `Payment for: ${order.gigId.title}`,
      // Hold funds in escrow until order completion
      capture_method: 'manual'
    });

    // Update order with payment intent
    order.paymentIntentId = paymentIntent.id;
    order.paymentStatus = 'processing';
    await order.save();

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });

  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ 
      message: 'Failed to create payment intent',
      error: error.message 
    });
  }
};

// Confirm Payment (After successful payment)
const confirmPayment = async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    const buyerId = req.user.id;

    // Retrieve payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'requires_capture') {
      return res.status(400).json({ message: 'Payment not ready for confirmation' });
    }

    // Find order
    const order = await Order.findOne({ paymentIntentId })
      .populate('sellerId', 'name email')
      .populate('gigId', 'title');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Verify buyer
    if (order.buyerId.toString() !== buyerId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Capture the payment (move from pending to escrow)
    await stripe.paymentIntents.capture(paymentIntentId);

    // Update order status
    order.paymentStatus = 'paid';
    order.status = 'active';
    order.statusHistory.push({
      status: 'active',
      note: 'Payment confirmed. Funds held in escrow until delivery.'
    });

    // Add system message
    order.messages.push({
      sender: order.sellerId._id,
      message: `Payment confirmed! I'll start working on your order right away. Expected delivery: ${order.deliveryTime} days.`,
      isSystem: true
    });

    await order.save();

    // Send real-time notification to seller
    if (global.io) {
      global.io.to(`user_${order.sellerId._id}`).emit('payment_received', {
        orderId: order._id,
        amount: order.amount,
        netAmount: (order.amount * 0.95).toFixed(2), // 95% after platform fee
        buyerName: order.buyerId.name || 'Client',
        gigTitle: order.gigId.title,
        message: 'Payment received! You can start working on the order.',
        paymentStatus: 'paid',
        timestamp: new Date()
      });

      // Also send notification to buyer
      global.io.to(`user_${order.buyerId}`).emit('payment_confirmed', {
        orderId: order._id,
        amount: order.amount,
        gigTitle: order.gigId.title,
        message: 'Payment confirmed! Your order is now active.',
        paymentStatus: 'paid',
        timestamp: new Date()
      });
    }

    res.json({
      message: 'Payment confirmed successfully',
      order: order
    });

  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({ 
      message: 'Failed to confirm payment',
      error: error.message 
    });
  }
};

// Release Payment to Seller (When order is completed)
const releasePayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const buyerId = req.user.id;

    const order = await Order.findById(orderId)
      .populate('sellerId', 'name email stripeAccountId');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Verify buyer
    if (order.buyerId.toString() !== buyerId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Check if order is delivered
    if (order.status !== 'delivered') {
      return res.status(400).json({ message: 'Order must be delivered first' });
    }

    // Check if payment already released
    if (order.paymentStatus === 'released') {
      return res.status(400).json({ message: 'Payment already released' });
    }

    // Get payment intent details
    const paymentIntent = await stripe.paymentIntents.retrieve(order.paymentIntentId);
    const sellerAmount = parseInt(paymentIntent.metadata.sellerAmount);
    const platformFee = parseInt(paymentIntent.metadata.platformFee);

    // Create transfer to seller (if they have connected account)
    if (order.sellerId.stripeAccountId) {
      await stripe.transfers.create({
        amount: sellerAmount,
        currency: 'usd',
        destination: order.sellerId.stripeAccountId,
        description: `Payment for completed order: ${order.gigTitle}`,
        metadata: {
          orderId: orderId,
          buyerId: buyerId,
          sellerId: order.sellerId._id.toString()
        }
      });
    }

    // Update order
    order.status = 'completed';
    order.paymentStatus = 'released';
    order.statusHistory.push({
      status: 'completed',
      note: 'Order completed and payment released to seller'
    });

    // Add completion message
    order.messages.push({
      sender: buyerId,
      message: 'Thank you! Order completed successfully. Payment has been released.',
      isSystem: true
    });

    await order.save();

    // Send real-time notification to seller about payment release
    if (global.io) {
      global.io.to(`user_${order.sellerId._id}`).emit('payment_released', {
        orderId: order._id,
        amount: sellerAmount / 100, // Convert back from cents
        gigTitle: order.gigTitle,
        message: 'Payment has been released to your account!'
      });
    }

    res.json({
      message: 'Payment released successfully',
      order: order
    });

  } catch (error) {
    console.error('Error releasing payment:', error);
    res.status(500).json({ 
      message: 'Failed to release payment',
      error: error.message 
    });
  }
};

// Refund Payment (For cancellations)
const refundPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check authorization (buyer or seller can request refund)
    if (order.buyerId.toString() !== userId && order.sellerId.toString() !== userId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Check if refund is possible
    if (order.paymentStatus === 'refunded') {
      return res.status(400).json({ message: 'Order already refunded' });
    }

    if (order.paymentStatus === 'released') {
      return res.status(400).json({ message: 'Cannot refund completed order' });
    }

    // Process refund through Stripe
    if (order.paymentIntentId) {
      const paymentIntent = await stripe.paymentIntents.retrieve(order.paymentIntentId);
      
      if (paymentIntent.status === 'requires_capture') {
        // Cancel uncaptured payment
        await stripe.paymentIntents.cancel(order.paymentIntentId);
      } else if (paymentIntent.status === 'succeeded') {
        // Refund captured payment
        await stripe.refunds.create({
          payment_intent: order.paymentIntentId,
          reason: 'requested_by_customer',
          metadata: {
            orderId: orderId,
            reason: reason || 'Order cancelled'
          }
        });
      }
    }

    // Update order
    order.status = 'cancelled';
    order.paymentStatus = 'refunded';
    order.statusHistory.push({
      status: 'cancelled',
      note: `Order cancelled and refunded. Reason: ${reason || 'No reason provided'}`
    });

    // Add cancellation message
    order.messages.push({
      sender: userId,
      message: `Order cancelled and refund processed. Reason: ${reason || 'No reason provided'}`,
      isSystem: true
    });

    await order.save();

    res.json({
      message: 'Order cancelled and refund processed',
      order: order
    });

  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({ 
      message: 'Failed to process refund',
      error: error.message 
    });
  }
};

// Get Seller Earnings
const getSellerEarnings = async (req, res) => {
  try {
    const sellerId = req.user.id;

    // Get all completed orders for seller
    const completedOrders = await Order.find({
      sellerId: sellerId,
      paymentStatus: 'released'
    }).populate('gigId', 'title').populate('buyerId', 'name');

    // Get pending orders (paid but not released)
    const pendingOrders = await Order.find({
      sellerId: sellerId,
      paymentStatus: 'paid'
    }).populate('gigId', 'title');

    // Calculate earnings
    const totalEarnings = completedOrders.reduce((sum, order) => {
      return sum + (order.amount * 0.95); // Seller gets 95%
    }, 0);

    const pendingEarnings = pendingOrders.reduce((sum, order) => {
      return sum + (order.amount * 0.95); // Seller gets 95%
    }, 0);

    const monthlyEarnings = completedOrders
      .filter(order => {
        const orderDate = new Date(order.updatedAt);
        const currentMonth = new Date();
        return orderDate.getMonth() === currentMonth.getMonth() && 
               orderDate.getFullYear() === currentMonth.getFullYear();
      })
      .reduce((sum, order) => sum + (order.amount * 0.95), 0);

    // Available for withdrawal (completed orders)
    const availableForWithdrawal = totalEarnings;

    res.json({
      totalEarnings: parseFloat(totalEarnings.toFixed(2)),
      monthlyEarnings: parseFloat(monthlyEarnings.toFixed(2)),
      pendingEarnings: parseFloat(pendingEarnings.toFixed(2)),
      availableForWithdrawal: parseFloat(availableForWithdrawal.toFixed(2)),
      completedOrders: completedOrders.length,
      pendingOrders: pendingOrders.length,
      recentOrders: completedOrders.slice(0, 5).map(order => ({
        ...order.toObject(),
        netAmount: parseFloat((order.amount * 0.95).toFixed(2))
      }))
    });

  } catch (error) {
    console.error('Error fetching seller earnings:', error);
    res.status(500).json({ 
      message: 'Failed to fetch earnings',
      error: error.message 
    });
  }
};

// Get payment history for user
const getPaymentHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { role } = req.user;
    const { page = 1, limit = 20, status, type } = req.query;

    let query = {};
    if (role === 'client') {
      query.buyerId = userId;
    } else {
      query.sellerId = userId;
    }

    if (status) {
      query.paymentStatus = status;
    }

    const orders = await Order.find(query)
      .populate('gigId', 'title image')
      .populate('buyerId', 'name email')
      .populate('sellerId', 'name email')
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
    console.error('Error fetching payment history:', error);
    res.status(500).json({ 
      message: 'Failed to fetch payment history',
      error: error.message 
    });
  }
};

// Process withdrawal for seller
const processWithdrawal = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { amount, method = 'bank_transfer' } = req.body;

    // Get seller's available balance
    const completedOrders = await Order.find({
      sellerId: sellerId,
      paymentStatus: 'released'
    });

    const availableBalance = completedOrders.reduce((sum, order) => {
      return sum + (order.amount * 0.95); // Seller gets 95%
    }, 0);

    if (amount > availableBalance) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    // Create withdrawal record
    const withdrawal = {
      sellerId,
      amount,
      method,
      status: 'pending',
      requestedAt: new Date()
    };

    // In production, integrate with payment processor for actual withdrawal
    // For now, mark as processed
    withdrawal.status = 'completed';
    withdrawal.processedAt = new Date();

    res.json({
      message: 'Withdrawal processed successfully',
      withdrawal
    });

  } catch (error) {
    console.error('Error processing withdrawal:', error);
    res.status(500).json({ 
      message: 'Failed to process withdrawal',
      error: error.message 
    });
  }
};

// Handle dispute
const createDispute = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason, description } = req.body;
    const userId = req.user.id;

    const order = await Order.findById(orderId)
      .populate('buyerId', 'name email')
      .populate('sellerId', 'name email');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check authorization
    if (order.buyerId._id.toString() !== userId && order.sellerId._id.toString() !== userId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Check if dispute already exists
    if (order.disputeStatus) {
      return res.status(400).json({ message: 'Dispute already exists for this order' });
    }

    // Create dispute
    order.disputeStatus = 'open';
    order.dispute = {
      initiatedBy: userId,
      reason,
      description,
      status: 'open',
      createdAt: new Date()
    };

    order.statusHistory.push({
      status: 'disputed',
      note: `Dispute opened: ${reason}`
    });

    await order.save();

    // Send system message about dispute
    const { sendSystemMessage } = require('./chatController');
    await sendSystemMessage(
      orderId, 
      `⚠️ A dispute has been opened for this order. Reason: ${reason}. Our support team will review this case.`,
      { type: 'dispute_opened', reason, description }
    );

    res.json({
      message: 'Dispute created successfully',
      dispute: order.dispute
    });

  } catch (error) {
    console.error('Error creating dispute:', error);
    res.status(500).json({ 
      message: 'Failed to create dispute',
      error: error.message 
    });
  }
};

// Auto-release payment after delivery period
const autoReleasePayments = async () => {
  try {
    const autoReleaseHours = 72; // 3 days after delivery
    const cutoffDate = new Date(Date.now() - (autoReleaseHours * 60 * 60 * 1000));

    const ordersToRelease = await Order.find({
      status: 'delivered',
      paymentStatus: 'paid',
      deliveredAt: { $lte: cutoffDate },
      disputeStatus: { $ne: 'open' }
    });

    for (const order of ordersToRelease) {
      try {
        // Auto-release payment
        const paymentIntent = await stripe.paymentIntents.retrieve(order.paymentIntentId);
        const sellerAmount = parseInt(paymentIntent.metadata.sellerAmount);

        // Create transfer to seller if they have connected account
        if (order.sellerId.stripeAccountId) {
          await stripe.transfers.create({
            amount: sellerAmount,
            currency: 'usd',
            destination: order.sellerId.stripeAccountId,
            description: `Auto-released payment for order: ${order.gigTitle}`,
            metadata: {
              orderId: order._id.toString(),
              autoRelease: 'true'
            }
          });
        }

        // Update order
        order.status = 'completed';
        order.paymentStatus = 'released';
        order.statusHistory.push({
          status: 'completed',
          note: 'Payment auto-released after delivery period'
        });

        await order.save();

        // Send system message
        const { sendSystemMessage } = require('./chatController');
        await sendSystemMessage(
          order._id, 
          '✅ Payment has been automatically released to the seller after the review period.',
          { type: 'auto_release' }
        );

        console.log(`Auto-released payment for order ${order._id}`);
      } catch (error) {
        console.error(`Failed to auto-release payment for order ${order._id}:`, error);
      }
    }

    return ordersToRelease.length;
  } catch (error) {
    console.error('Error in auto-release payments:', error);
    return 0;
  }
};

// Get platform statistics (admin only)
const getPlatformStats = async (req, res) => {
  try {
    // This would typically check for admin role
    const totalOrders = await Order.countDocuments();
    const completedOrders = await Order.countDocuments({ status: 'completed' });
    const totalRevenue = await Order.aggregate([
      { $match: { paymentStatus: 'released' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    const platformFees = await Order.aggregate([
      { $match: { paymentStatus: 'released' } },
      { $group: { _id: null, total: { $sum: { $multiply: ['$amount', 0.05] } } } }
    ]);

    res.json({
      totalOrders,
      completedOrders,
      totalRevenue: totalRevenue[0]?.total || 0,
      platformFees: platformFees[0]?.total || 0,
      completionRate: totalOrders > 0 ? (completedOrders / totalOrders * 100).toFixed(2) : 0
    });

  } catch (error) {
    console.error('Error fetching platform stats:', error);
    res.status(500).json({ 
      message: 'Failed to fetch platform statistics',
      error: error.message 
    });
  }
};

// Get real-time payment notifications for user
const getPaymentNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { role } = req.user;
    
    let query = {};
    if (role === 'freelancer') {
      query.sellerId = userId;
    } else {
      query.buyerId = userId;
    }
    
    // Get recent payment activities
    const recentPayments = await Order.find({
      ...query,
      paymentStatus: { $in: ['paid', 'released'] },
      updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    })
    .populate('gigId', 'title')
    .populate('buyerId', 'name')
    .populate('sellerId', 'name')
    .sort({ updatedAt: -1 })
    .limit(10);

    const notifications = recentPayments
      .filter(order => order && order.gigId && order.gigId.title) // Guard against missing gig data
      .map(order => ({
        id: order._id,
        type: role === 'freelancer' ? 'payment_received' : 'payment_sent',
        title: role === 'freelancer' ? 'Payment Received' : 'Payment Sent',
        message: role === 'freelancer' 
          ? `You received $${(order.amount * 0.95).toFixed(2)} for "${order.gigId.title}"`
          : `Payment of $${order.amount} sent for "${order.gigId.title}"`,
        amount: role === 'freelancer' ? (order.amount * 0.95) : order.amount,
        gigTitle: order.gigId.title,
        paymentStatus: order.paymentStatus,
        timestamp: order.updatedAt,
        isRead: false
      }));

    res.json(notifications);
  } catch (error) {
    console.error('Error fetching payment notifications:', error);
    res.status(500).json({ 
      message: 'Failed to fetch payment notifications',
      error: error.message 
    });
  }
};

const PaymentMethod = require('../models/PaymentMethod');

// Get payment methods for user
const getPaymentMethods = async (req, res) => {
  try {
    const userId = req.user.id;

    const paymentMethods = await PaymentMethod.find({
      userId: userId,
      status: 'active'
    }).sort({ isPrimary: -1, createdAt: -1 });

    res.json(paymentMethods);
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({
      message: 'Failed to fetch payment methods',
      error: error.message
    });
  }
};

// Add payment method for user
const addPaymentMethod = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, accountName, accountNumber, routingNumber, bankName, email } = req.body;

    // Check if this is the first payment method for the user
    const existingMethods = await PaymentMethod.countDocuments({ userId: userId });
    const isPrimary = existingMethods === 0;

    const paymentMethod = new PaymentMethod({
      userId,
      type,
      accountName,
      accountNumber,
      routingNumber,
      bankName,
      email,
      isPrimary
    });

    await paymentMethod.save();

    res.status(201).json({
      message: 'Payment method added successfully',
      paymentMethod
    });
  } catch (error) {
    console.error('Error adding payment method:', error);
    res.status(500).json({
      message: 'Failed to add payment method',
      error: error.message
    });
  }
};

// Update payment method
const updatePaymentMethod = async (req, res) => {
  try {
    const { methodId } = req.params;
    const userId = req.user.id;
    const updates = req.body;

    const paymentMethod = await PaymentMethod.findOne({
      _id: methodId,
      userId: userId
    });

    if (!paymentMethod) {
      return res.status(404).json({ message: 'Payment method not found' });
    }

    // Update fields
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        paymentMethod[key] = updates[key];
      }
    });

    await paymentMethod.save();

    res.json({
      message: 'Payment method updated successfully',
      paymentMethod
    });
  } catch (error) {
    console.error('Error updating payment method:', error);
    res.status(500).json({
      message: 'Failed to update payment method',
      error: error.message
    });
  }
};

// Delete payment method
const deletePaymentMethod = async (req, res) => {
  try {
    const { methodId } = req.params;
    const userId = req.user.id;

    const paymentMethod = await PaymentMethod.findOne({
      _id: methodId,
      userId: userId
    });

    if (!paymentMethod) {
      return res.status(404).json({ message: 'Payment method not found' });
    }

    // Don't allow deletion of primary payment method if there are others
    if (paymentMethod.isPrimary) {
      const otherMethods = await PaymentMethod.countDocuments({
        userId: userId,
        _id: { $ne: methodId },
        status: 'active'
      });

      if (otherMethods > 0) {
        return res.status(400).json({
          message: 'Cannot delete primary payment method. Set another method as primary first.'
        });
      }
    }

    await PaymentMethod.findByIdAndDelete(methodId);

    res.json({ message: 'Payment method deleted successfully' });
  } catch (error) {
    console.error('Error deleting payment method:', error);
    res.status(500).json({
      message: 'Failed to delete payment method',
      error: error.message
    });
  }
};

// Set primary payment method
const setPrimaryPaymentMethod = async (req, res) => {
  try {
    const { methodId } = req.params;
    const userId = req.user.id;

    // First, unset all primary flags for this user
    await PaymentMethod.updateMany(
      { userId: userId },
      { isPrimary: false }
    );

    // Then set the specified method as primary
    const paymentMethod = await PaymentMethod.findOneAndUpdate(
      { _id: methodId, userId: userId },
      { isPrimary: true },
      { new: true }
    );

    if (!paymentMethod) {
      return res.status(404).json({ message: 'Payment method not found' });
    }

    res.json({
      message: 'Primary payment method updated successfully',
      paymentMethod
    });
  } catch (error) {
    console.error('Error setting primary payment method:', error);
    res.status(500).json({
      message: 'Failed to set primary payment method',
      error: error.message
    });
  }
};

module.exports = {
  createPaymentIntent,
  confirmPayment,
  releasePayment,
  refundPayment,
  getSellerEarnings,
  getPaymentHistory,
  processWithdrawal,
  createDispute,
  autoReleasePayments,
  getPlatformStats,
  getPaymentNotifications,
  getPaymentMethods,
  addPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  setPrimaryPaymentMethod
};
