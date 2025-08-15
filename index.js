require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
require('./config/passport');

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);

// CORS setup
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.CLIENT_URL,
  'http://localhost:3000'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like curl/postman) or from allowed origins
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Session & Passport (for Google OAuth)
app.use(session({
  secret: process.env.SESSION_SECRET || process.env.JWT_SECRET || 'session_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Render uses HTTP between proxy and app
    sameSite: 'lax'
  }
}));
app.use(passport.initialize());
app.use(passport.session());

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
// Optional test routes (keep mounted only if needed)
app.use('/api/test', require('./routes/testRoutes'));

// Socket.IO setup
const io = new Server(server, {
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

  socket.on('disconnect', () => {
    // cleanup handled by socket.io
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (allowedOrigins.length) {
    console.log('CORS allowed origins:', allowedOrigins.join(', '));
  }
});