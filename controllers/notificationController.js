const Notification = require('../models/Notification');
const User = require('../models/User');

// Create notification
const createNotification = async (notificationData) => {
  try {
    const notification = new Notification(notificationData);
    await notification.save();
    
    // TODO: Send real-time notification via WebSocket
    // io.to(notificationData.userId).emit('new_notification', notification);
    
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

// Get user notifications
const getUserNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    
    const query = { userId };
    if (unreadOnly === 'true') {
      query.isRead = false;
    }
    
    const notifications = await Notification.find(query)
      .populate('fromUserId', 'name profilePicture')
      .populate('orderId', 'gigTitle totalAmount')
      .populate('gigId', 'title image')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ userId, isRead: false });
    
    res.json({
      notifications,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total,
      unreadCount
    });
    
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
};

// Mark notification as read
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId },
      { 
        isRead: true,
        readAt: new Date()
      },
      { new: true }
    );
    
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    
    res.json({ message: 'Notification marked as read' });
    
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ message: 'Failed to mark notification as read' });
  }
};

// Mark all notifications as read
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    
    await Notification.updateMany(
      { userId, isRead: false },
      { 
        isRead: true,
        readAt: new Date()
      }
    );
    
    res.json({ message: 'All notifications marked as read' });
    
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ message: 'Failed to mark all notifications as read' });
  }
};

// Delete notification
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const notification = await Notification.findOneAndDelete({ _id: id, userId });
    
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    
    res.json({ message: 'Notification deleted' });
    
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ message: 'Failed to delete notification' });
  }
};

// Helper functions for creating specific notifications
const notificationHelpers = {
  // Order notifications
  orderPlaced: async (order) => {
    await createNotification({
      userId: order.sellerId,
      title: 'New Order Received!',
      message: `You received a new order for "${order.gigTitle}"`,
      type: 'order_placed',
      orderId: order._id,
      fromUserId: order.buyerId,
      actionUrl: `/freelancer/orders/${order._id}`
    });
  },
  
  orderDelivered: async (order) => {
    await createNotification({
      userId: order.buyerId,
      title: 'Order Delivered!',
      message: `Your order "${order.gigTitle}" has been delivered`,
      type: 'order_delivered',
      orderId: order._id,
      fromUserId: order.sellerId,
      actionUrl: `/client/orders/${order._id}`
    });
  },
  
  orderCompleted: async (order) => {
    await createNotification({
      userId: order.sellerId,
      title: 'Order Completed!',
      message: `Your order "${order.gigTitle}" has been completed and payment released`,
      type: 'order_completed',
      orderId: order._id,
      fromUserId: order.buyerId,
      actionUrl: `/freelancer/orders/${order._id}`
    });
  },
  
  paymentReceived: async (order, amount) => {
    await createNotification({
      userId: order.sellerId,
      title: 'Payment Received!',
      message: `You received $${amount} for "${order.gigTitle}"`,
      type: 'payment_received',
      orderId: order._id,
      fromUserId: order.buyerId,
      actionUrl: '/freelancer/earnings',
      metadata: { amount }
    });
  },
  
  messageReceived: async (message, conversationId) => {
    // Get other participants in conversation
    const Conversation = require('../models/Conversation');
    const conversation = await Conversation.findById(conversationId);
    const otherParticipants = conversation.participants.filter(
      p => p.toString() !== message.sender.toString()
    );
    
    // Create notification for each other participant
    for (const participantId of otherParticipants) {
      await createNotification({
        userId: participantId,
        title: 'New Message',
        message: `You have a new message: "${message.content.substring(0, 50)}..."`,
        type: 'message_received',
        fromUserId: message.sender,
        actionUrl: `/messages?conversationId=${conversationId}`
      });
    }
  }
};

module.exports = {
  createNotification,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  notificationHelpers
};