const express = require('express');
const router = express.Router();
const {
  getConversations,
  getOrCreateConversation,
  createDirectConversation,
  getMessages,
  sendMessage,
  markAsRead,
  deleteMessage,
  searchConversations,
  uploadFile,
  editMessage,
  addReaction,
  migrateOrderMessagesToConversations
} = require('../controllers/chatController');
const { verifyToken } = require('../middleware/verifyToken');
const upload = require('../middleware/upload');

// All routes require authentication
router.use(verifyToken);

// Get all conversations for user
router.get('/conversations', getConversations);

// Search conversations
router.get('/conversations/search', searchConversations);

// Get or create conversation
router.post('/conversations', getOrCreateConversation);

// Create direct conversation with any user
router.post('/conversations/direct', createDirectConversation);

// Get messages for a conversation
router.get('/conversations/:conversationId/messages', getMessages);

// Send message
router.post('/conversations/:conversationId/messages', sendMessage);

// Mark conversation as read
router.patch('/conversations/:conversationId/read', markAsRead);

// Upload file
router.post('/upload', upload.single('file'), uploadFile);

// Edit message
router.put('/messages/:messageId', editMessage);

// Delete message
router.delete('/messages/:messageId', deleteMessage);

// Add reaction to message
router.post('/messages/:messageId/reactions', addReaction);

// Migration route (temporary - for development)
router.post('/migrate-order-messages', migrateOrderMessagesToConversations);

module.exports = router;