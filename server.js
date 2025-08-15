require('dotenv').config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const passport = require("passport");
const session = require("express-session");
const connectDB = require("./config/db");
const cors = require("cors");
require("./config/passport"); 

// Connect to MongoDB
connectDB();

// CORS configuration
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://localhost:3000",
  "http://localhost:5000", // Allow server self-requests
  "http://127.0.0.1:5000",
  process.env.FRONTEND_URL,
  process.env.REACT_APP_FRONTEND_URL
].filter(Boolean);

// Init express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.io with CORS
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Socket auth middleware: verify JWT from handshake auth or header
const jwt = require('jsonwebtoken');
const Conversation = require('./models/Conversation');
const Order = require('./models/Order');
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token || (socket.handshake.headers?.authorization?.split(' ')[1]);
    if (!token) return next(new Error('Unauthorized'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = { id: decoded.id, name: decoded.name, role: decoded.role };
    return next();
  } catch (e) {
    return next(new Error('Unauthorized'));
  }
});

// Make io accessible to other modules
global.io = io;

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // In development (when NODE_ENV is not 'production'), be more permissive
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (!isProduction) {
      // In development, allow all origins to simplify local testing
      console.log('✅ Dev mode CORS allowed for origin:', origin);
      return callback(null, true);
    }
    
    // Check against allowed origins list
    if (allowedOrigins.indexOf(origin) !== -1) {
      console.log('✅ CORS allowed for whitelisted origin:', origin);
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      console.log('📋 Allowed origins:', allowedOrigins);
      console.log('🔧 NODE_ENV:', process.env.NODE_ENV || 'undefined');
      console.log('🏠 Is Production:', isProduction);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
}));

// Handle preflight requests - removed problematic * pattern

// Body parsers (MUST have this before routes)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Sessions (for Passport if needed)
app.use(session({
  secret: "secret",
  resave: false,
  saveUninitialized: false
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join user to their personal room
  socket.on('join_user_room', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`User ${userId} joined their room`);
  });

  // Join conversation room (authorize participant)
  socket.on('join_conversation', async (conversationId) => {
    try {
      const conv = await Conversation.findById(conversationId).select('participants');
      if (!conv) return;
      const isParticipant = conv.participants.map(String).includes(socket.user.id);
      if (!isParticipant) return;
      socket.join(`conversation_${conversationId}`);
      console.log(`User ${socket.user.id} joined conversation: ${conversationId}`);
    } catch (e) {
      console.error('join_conversation auth error', e.message);
    }
  });

  // Leave conversation room
  socket.on('leave_conversation', (conversationId) => {
    socket.leave(`conversation_${conversationId}`);
    console.log(`User ${socket.user?.id} left conversation: ${conversationId}`);
  });

  // Join order room for real-time messaging (authorize buyer/seller)
  socket.on('join_order', async (orderId) => {
    try {
      const order = await Order.findById(orderId).select('buyerId sellerId');
      if (!order) return;
      const allowed = [String(order.buyerId), String(order.sellerId)].includes(socket.user.id);
      if (!allowed) return;
      socket.join(`order_${orderId}`);
      console.log(`🚪 User ${socket.user.id} joined order room: order_${orderId}`);
      const rooms = Array.from(socket.rooms);
      console.log(`📋 Socket ${socket.id} is now in rooms:`, rooms);
    } catch (e) {
      console.error('join_order auth error', e.message);
    }
  });

  // Leave order room
  socket.on('leave_order', (orderId) => {
    socket.leave(`order_${orderId}`);
    console.log(`🚪 User ${socket.id} left order room: order_${orderId}`);
  });

  // Handle typing indicators for conversations
  socket.on('typing_start', (data) => {
    socket.to(`conversation_${data.conversationId}`).emit('user_typing', {
      userId: data.userId,
      userName: data.userName
    });
  });

  socket.on('typing_stop', (data) => {
    socket.to(`conversation_${data.conversationId}`).emit('user_stopped_typing', {
      userId: data.userId
    });
  });

  // Handle typing indicators for orders
  socket.on('order_typing_start', (data) => {
    socket.to(`order_${data.orderId}`).emit('order_user_typing', {
      userId: data.userId,
      userName: data.userName
    });
  });

  socket.on('order_typing_stop', (data) => {
    socket.to(`order_${data.orderId}`).emit('order_user_stopped_typing', {
      userId: data.userId
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    uptime: process.uptime()
  });
});

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/users", require("./routes/userRoutes")); // ✅ User routes
app.use("/api/gigs", require("./routes/gigRoutes")); // ✅ Gigs route added correctly
app.use("/api/orders", require("./routes/orderRoutes"));
app.use("/api/reviews", require("./routes/reviewRoutes"));
app.use("/api/payments", require("./routes/paymentRoutes")); // ✅ Payment routes
app.use("/api/chat", require("./routes/chatRoutes")); // ✅ Chat routes
app.use("/api/delivery", require("./routes/deliveryRoutes")); // ✅ Delivery routes
app.use("/api/notifications", require("./routes/notificationRoutes")); // ✅ Notification routes
// app.use("/api/test", require("./routes/testRoutes")); // ✅ Test routes for development - temporarily disabled


// Professional Error Handler
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

// Auto-migrate order messages to conversations on startup
const autoMigrateOrderMessages = async () => {
  try {
    const Order = require('./models/Order');
    const Conversation = require('./models/Conversation');
    const Message = require('./models/Message');
    
    console.log('🔄 Checking for order messages to migrate...');
    
    // Find orders with messages that don't have corresponding conversations
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

    if (conversationsCreated > 0 || migratedCount > 0) {
      console.log(`✅ Migration completed: ${conversationsCreated} conversations created, ${migratedCount} messages migrated`);
    } else {
      console.log('✅ No migration needed - all order messages already converted');
    }
  } catch (error) {
    console.error('❌ Error during auto-migration:', error);
  }
};

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Run auto-migration after server starts
  setTimeout(autoMigrateOrderMessages, 2000); // Wait 2 seconds for DB connection
});
