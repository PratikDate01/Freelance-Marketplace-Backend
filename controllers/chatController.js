const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const Order = require('../models/Order');
const Gig = require('../models/Gig');

// Get all conversations for a user
const getConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const conversations = await Conversation.find({
      participants: userId,
      status: { $ne: 'archived' }
    })
    .populate('participants', 'name email profilePicture avatar role')
    .populate('orderId', 'gigTitle status totalAmount')
    .populate('gigId', 'title image')
    .populate('lastMessage.sender', 'name')
    .sort({ 'lastMessage.timestamp': -1 });
    
    // Format conversations with unread counts
    const formattedConversations = conversations.map(conv => {
      const otherParticipant = conv.participants.find(p => p._id.toString() !== userId);
      const unreadCount = conv.unreadCount.find(uc => uc.userId.toString() === userId)?.count || 0;
      
      return {
        ...conv.toObject(),
        otherParticipant,
        unreadCount
      };
    });
    
    res.json(formattedConversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ message: 'Failed to fetch conversations' });
  }
};

// Get or create conversation
const getOrCreateConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    let { participantId, orderId, gigId, type = 'general' } = req.body;
    
    // If orderId is provided but no participantId, get it from the order
    if (orderId && !participantId) {
      const order = await Order.findById(orderId).populate('buyerId sellerId');
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }
      
      // Determine the other participant based on current user's role
      if (order.buyerId._id.toString() === userId) {
        participantId = order.sellerId._id.toString();
      } else if (order.sellerId._id.toString() === userId) {
        participantId = order.buyerId._id.toString();
      } else {
        return res.status(403).json({ message: 'You are not a participant in this order' });
      }
    }
    
    // If gigId is provided but no participantId, get it from the gig
    if (gigId && !participantId) {
      const gig = await Gig.findById(gigId).populate('userId');
      if (!gig) {
        return res.status(404).json({ message: 'Gig not found' });
      }
      participantId = gig.userId._id.toString();
    }
    
    if (!participantId) {
      return res.status(400).json({ message: 'Participant ID is required' });
    }
    
    // Check if conversation already exists
    let conversation;
    
    if (orderId) {
      // For order-based conversations, look for existing conversation with same order
      conversation = await Conversation.findOne({
        participants: { $all: [userId, participantId] },
        orderId
      }).populate('participants', 'name email profilePicture avatar role');
    } else if (gigId) {
      // For gig-based conversations, look for existing conversation with same gig
      conversation = await Conversation.findOne({
        participants: { $all: [userId, participantId] },
        gigId
      }).populate('participants', 'name email profilePicture avatar role');
    } else {
      // For general conversations, look for any conversation between these participants
      conversation = await Conversation.findOne({
        participants: { $all: [userId, participantId] },
        orderId: { $exists: false },
        gigId: { $exists: false }
      }).populate('participants', 'name email profilePicture avatar role');
    }
    
    if (!conversation) {
      // Create new conversation
      conversation = new Conversation({
        participants: [userId, participantId],
        orderId,
        gigId,
        type,
        unreadCount: [
          { userId, count: 0 },
          { userId: participantId, count: 0 }
        ]
      });
      
      await conversation.save();
      await conversation.populate('participants', 'name email profilePicture avatar role');
    }
    
    res.json(conversation);
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ message: 'Failed to create conversation' });
  }
};

// Get messages for a conversation
const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const { page = 1, limit = 50 } = req.query;
    
    // Verify user is participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.includes(userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const messages = await Message.find({
      conversationId,
      isDeleted: false
    })
    .populate('sender', 'name profilePicture avatar')
    .populate('replyTo', 'content sender')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);
    
    // Mark messages as read
    await Message.updateMany(
      {
        conversationId,
        sender: { $ne: userId },
        status: { $ne: 'read' }
      },
      {
        $set: { status: 'read' },
        $addToSet: {
          readBy: {
            userId,
            readAt: new Date()
          }
        }
      }
    );
    
    // Update unread count
    await Conversation.updateOne(
      { _id: conversationId },
      {
        $set: {
          'unreadCount.$[elem].count': 0
        }
      },
      {
        arrayFilters: [{ 'elem.userId': userId }]
      }
    );
    
    res.json(messages.reverse());
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
};

// Send a message
const sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const { content, messageType = 'text', attachments = [], replyTo } = req.body;
    
    // Verify user is participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.includes(userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Create message
    const message = new Message({
      conversationId,
      sender: userId,
      content,
      messageType,
      attachments,
      replyTo
    });
    
    await message.save();
    await message.populate('sender', 'name profilePicture');
    
    // Update conversation's last message
    conversation.lastMessage = {
      content,
      sender: userId,
      timestamp: new Date(),
      messageType
    };
    
    // Update unread counts for other participants
    const otherParticipants = conversation.participants.filter(p => p.toString() !== userId);
    otherParticipants.forEach(participantId => {
      const unreadEntry = conversation.unreadCount.find(uc => uc.userId.toString() === participantId.toString());
      if (unreadEntry) {
        unreadEntry.count += 1;
      }
    });
    
    await conversation.save();
    
    // Emit socket event for real-time updates
    if (global.io) {
      // Emit to conversation room
      global.io.to(`conversation_${conversationId}`).emit('new_message', {
        ...message.toObject(),
        conversation: {
          _id: conversation._id,
          participants: conversation.participants
        }
      });
      
      // Notify other participants individually
      otherParticipants.forEach(participantId => {
        const unreadCount = conversation.unreadCount.find(uc => uc.userId.toString() === participantId.toString())?.count || 0;
        
        // Send conversation update
        global.io.to(`user_${participantId}`).emit('conversation_updated', {
          conversationId: conversation._id,
          lastMessage: conversation.lastMessage,
          unreadCount: unreadCount
        });
        
        // Send message notification
        global.io.to(`user_${participantId}`).emit('message_notification', {
          conversationId: conversation._id,
          senderId: userId,
          senderName: message.sender.name,
          content: content,
          timestamp: new Date(),
          unreadCount: unreadCount
        });
      });
    }
    
    res.json(message);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Failed to send message' });
  }
};

// Send system message (for order updates)
const sendSystemMessage = async (orderId, content, systemData = null) => {
  try {
    const order = await Order.findById(orderId);
    if (!order) return;
    
    // Find or create conversation for this order
    let conversation = await Conversation.findOne({
      orderId,
      participants: { $all: [order.buyerId, order.sellerId] }
    });
    
    if (!conversation) {
      conversation = new Conversation({
        participants: [order.buyerId, order.sellerId],
        orderId,
        type: 'order',
        unreadCount: [
          { userId: order.buyerId, count: 0 },
          { userId: order.sellerId, count: 0 }
        ]
      });
      await conversation.save();
    }
    
    // Create system message
    const message = new Message({
      conversationId: conversation._id,
      sender: order.sellerId, // System messages appear from seller
      content,
      messageType: 'system',
      systemData
    });
    
    await message.save();
    
    // Update conversation
    conversation.lastMessage = {
      content,
      sender: order.sellerId,
      timestamp: new Date(),
      messageType: 'system'
    };
    
    // Increment unread for buyer
    const buyerUnread = conversation.unreadCount.find(uc => uc.userId.toString() === order.buyerId.toString());
    if (buyerUnread) {
      buyerUnread.count += 1;
    }
    
    await conversation.save();
    
    // Emit socket event for system message
    if (global.io) {
      global.io.to(`conversation_${conversation._id}`).emit('new_message', {
        ...message.toObject(),
        conversation: {
          _id: conversation._id,
          participants: conversation.participants
        }
      });
      
      // Notify buyer about system message
      global.io.to(`user_${order.buyerId}`).emit('conversation_updated', {
        conversationId: conversation._id,
        lastMessage: conversation.lastMessage,
        unreadCount: buyerUnread?.count || 0
      });
    }
    
    return message;
  } catch (error) {
    console.error('Error sending system message:', error);
  }
};

// Mark conversation as read
const markAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    
    await Conversation.updateOne(
      { _id: conversationId },
      {
        $set: {
          'unreadCount.$[elem].count': 0
        }
      },
      {
        arrayFilters: [{ 'elem.userId': userId }]
      }
    );
    
    res.json({ message: 'Marked as read' });
  } catch (error) {
    console.error('Error marking as read:', error);
    res.status(500).json({ message: 'Failed to mark as read' });
  }
};

// Delete message
const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;
    
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }
    
    if (message.sender.toString() !== userId) {
      return res.status(403).json({ message: 'Can only delete your own messages' });
    }
    
    message.isDeleted = true;
    message.deletedAt = new Date();
    message.content = 'This message was deleted';
    
    await message.save();
    
    res.json({ message: 'Message deleted' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ message: 'Failed to delete message' });
  }
};

// Search conversations
const searchConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const { query } = req.query;
    
    const conversations = await Conversation.find({
      participants: userId,
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { 'lastMessage.content': { $regex: query, $options: 'i' } }
      ]
    })
    .populate('participants', 'name email profilePicture')
    .populate('lastMessage.sender', 'name')
    .sort({ 'lastMessage.timestamp': -1 });
    
    res.json(conversations);
  } catch (error) {
    console.error('Error searching conversations:', error);
    res.status(500).json({ message: 'Failed to search conversations' });
  }
};

// Upload file for chat
const uploadFile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    // Verify user is participant in conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.includes(userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // File is already uploaded to Cloudinary via multer middleware
    res.json({
      fileUrl: req.file.path,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size
    });
    
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ message: 'Failed to upload file' });
  }
};

// Edit message
const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;
    
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }
    
    if (message.sender.toString() !== userId) {
      return res.status(403).json({ message: 'Can only edit your own messages' });
    }
    
    if (message.messageType !== 'text') {
      return res.status(400).json({ message: 'Can only edit text messages' });
    }
    
    // Save edit history
    message.editHistory.push({
      content: message.content,
      editedAt: new Date()
    });
    
    message.content = content;
    message.isEdited = true;
    
    await message.save();
    await message.populate('sender', 'name profilePicture');
    
    res.json(message);
  } catch (error) {
    console.error('Error editing message:', error);
    res.status(500).json({ message: 'Failed to edit message' });
  }
};

// Add reaction to message
const addReaction = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user.id;
    
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }
    
    // Check if user already reacted with this emoji
    const existingReaction = message.reactions.find(
      r => r.userId.toString() === userId && r.emoji === emoji
    );
    
    if (existingReaction) {
      // Remove reaction
      message.reactions = message.reactions.filter(
        r => !(r.userId.toString() === userId && r.emoji === emoji)
      );
    } else {
      // Add reaction
      message.reactions.push({
        userId,
        emoji,
        timestamp: new Date()
      });
    }
    
    await message.save();
    res.json(message);
  } catch (error) {
    console.error('Error adding reaction:', error);
    res.status(500).json({ message: 'Failed to add reaction' });
  }
};

// Create conversation with any user (for direct messaging)
const createDirectConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { participantId } = req.body;
    
    if (!participantId) {
      return res.status(400).json({ message: 'Participant ID is required' });
    }
    
    if (participantId === userId) {
      return res.status(400).json({ message: 'Cannot create conversation with yourself' });
    }
    
    // Check if participant exists
    const participant = await User.findById(participantId);
    if (!participant) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if conversation already exists (any conversation between these users)
    let conversation = await Conversation.findOne({
      participants: { $all: [userId, participantId] },
      orderId: { $exists: false },
      gigId: { $exists: false }
    }).populate('participants', 'name email profilePicture role');
    
    if (!conversation) {
      // Create new conversation
      conversation = new Conversation({
        participants: [userId, participantId],
        type: 'direct',
        unreadCount: [
          { userId, count: 0 },
          { userId: participantId, count: 0 }
        ]
      });
      
      await conversation.save();
      await conversation.populate('participants', 'name email profilePicture avatar role');
    }
    
    res.json(conversation);
  } catch (error) {
    console.error('Error creating direct conversation:', error);
    res.status(500).json({ message: 'Failed to create conversation' });
  }
};

// Migration function to convert existing order messages to conversations
const migrateOrderMessagesToConversations = async (req, res) => {
  try {
    console.log('🔄 Starting migration of order messages to conversations...');
    
    // Find all orders with messages
    const ordersWithMessages = await Order.find({
      'messages.0': { $exists: true }
    }).populate('buyerId sellerId', 'name email profilePicture avatar');

    let migratedCount = 0;
    let conversationsCreated = 0;

    for (const order of ordersWithMessages) {
      // Check if conversation already exists for this order
      let conversation = await Conversation.findOne({
        participants: { $all: [order.buyerId._id, order.sellerId._id] },
        orderId: order._id
      });

      if (!conversation) {
        // Create conversation for this order
        conversation = new Conversation({
          participants: [order.buyerId._id, order.sellerId._id],
          orderId: order._id,
          type: 'order',
          unreadCount: [
            { userId: order.buyerId._id, count: 0 },
            { userId: order.sellerId._id, count: 0 }
          ]
        });
        await conversation.save();
        conversationsCreated++;
        console.log(`✅ Created conversation for order ${order._id}`);
      }

      // Migrate messages
      for (const orderMessage of order.messages) {
        // Check if message already exists in chat system
        const existingMessage = await Message.findOne({
          conversationId: conversation._id,
          sender: orderMessage.sender,
          content: orderMessage.message,
          createdAt: orderMessage.timestamp
        });

        if (!existingMessage) {
          // Create message in chat system
          const chatMessage = new Message({
            conversationId: conversation._id,
            sender: orderMessage.sender,
            content: orderMessage.message,
            messageType: orderMessage.isSystem ? 'system' : 'text',
            createdAt: orderMessage.timestamp
          });
          await chatMessage.save();
          migratedCount++;
        }
      }

      // Update conversation's last message
      if (order.messages.length > 0) {
        const lastMessage = order.messages[order.messages.length - 1];
        conversation.lastMessage = {
          content: lastMessage.message,
          sender: lastMessage.sender,
          timestamp: lastMessage.timestamp,
          messageType: lastMessage.isSystem ? 'system' : 'text'
        };
        await conversation.save();
      }
    }

    console.log(`✅ Migration completed: ${conversationsCreated} conversations created, ${migratedCount} messages migrated`);
    
    res.json({
      success: true,
      message: `Migration completed successfully`,
      conversationsCreated,
      messagesMigrated: migratedCount
    });
  } catch (error) {
    console.error('❌ Error during migration:', error);
    res.status(500).json({ message: 'Migration failed', error: error.message });
  }
};

module.exports = {
  getConversations,
  getOrCreateConversation,
  createDirectConversation,
  getMessages,
  sendMessage,
  sendSystemMessage,
  markAsRead,
  deleteMessage,
  searchConversations,
  uploadFile,
  editMessage,
  addReaction,
  migrateOrderMessagesToConversations
};