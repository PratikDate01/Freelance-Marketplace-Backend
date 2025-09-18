require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const passport = require('passport');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
require('./config/passport');
const errorHandler = require('./middleware/errorHandler');

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);

// CORS setup
const isDev = process.env.NODE_ENV !== 'production';

const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.CLIENT_URL,
  ...(isDev ? ['http://localhost:3000', 'https://freelance-marketplace-frontend-gamma.vercel.app'] : [])
].filter(Boolean);

if (isDev) {
  // In development, reflect request origin (allow all), include credentials
  app.use(cors({ origin: true, credentials: true }));
} else {
  // In production, restrict to explicit allowlist
  app.use(cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      console.warn(`CORS blocked origin: ${origin}. Allowed: ${allowedOrigins.join(', ')}`);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
  }));
}

// Passport (JWT-based OAuth flow - no server sessions)
app.use(passport.initialize());

// Body parsing
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Healthcheck
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// API routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/gigs', require('./routes/gigRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/delivery', require('./routes/deliveryRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
// Optional test routes (development only)
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/test', require('./routes/testRoutes'));
}

// Global error handler (after routes)
app.use(errorHandler);

// Socket.IO setup
const io = new Server(server, {
  path: '/ws',
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  }
});

global.io = io; // used by controllers to emit events

const jwt = require('jsonwebtoken');

io.on('connection', (socket) => {
  try {
    const token = socket.handshake?.auth?.token;
    if (token && process.env.JWT_SECRET) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
    }
  } catch (e) {
    // Invalid token is fine; some events may require it later
  }

  // Room management matching frontend events
  socket.on('join_user_room', (userId) => {
    if (!userId) return;
    socket.join(`user_${userId}`);
  });

  socket.on('join_order', (orderId) => {
    if (!orderId) return;
    socket.join(`order_${orderId}`);
  });

  socket.on('leave_order', (orderId) => {
    if (!orderId) return;
    socket.leave(`order_${orderId}`);
  });

  socket.on('join_conversation', (conversationId) => {
    if (!conversationId) return;
    socket.join(`conversation_${conversationId}`);
  });

  socket.on('leave_conversation', (conversationId) => {
    if (!conversationId) return;
    socket.leave(`conversation_${conversationId}`);
  });

  socket.on('send_message', (data) => {
    // Handle sending message - this should be done via API, but for real-time, we can emit
    // Actually, messages are sent via API, this is just for real-time delivery
  });

  socket.on('typing_start', (data) => {
    const { conversationId, userId, userName } = data;
    socket.to(`conversation_${conversationId}`).emit('user_typing', {
      userId,
      userName,
      conversationId
    });
  });

  socket.on('typing_stop', (data) => {
    const { conversationId, userId } = data;
    socket.to(`conversation_${conversationId}`).emit('user_stopped_typing', {
      userId,
      conversationId
    });
  });

  socket.on('disconnect', () => {
    // cleanup handled by socket.io
  });
});

const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.send("Freelance Marketplace Backend is running 🚀");
});
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (allowedOrigins.length) {
    console.log('CORS allowed origins:', allowedOrigins.join(', '));
  }
});