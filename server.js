require('dotenv').config();
const express = require("express");
const passport = require("passport");
const session = require("express-session");
const connectDB = require("./config/db");
const cors = require("cors");
require("./config/passport"); 

// Connect to MongoDB
connectDB();

// Init express app
const app = express();

// CORS configuration
app.use(cors({
  origin: "http://localhost:3000",
  credentials: true
}));

// JSON parser (MUST have this before routes)
app.use(express.json());

// Sessions (for Passport if needed)
app.use(session({
  secret: "secret",
  resave: false,
  saveUninitialized: false
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/gigs", require("./routes/gigRoutes")); // ✅ Gigs route added correctly
app.use("/api/orders", require("./routes/orderRoutes"));
app.use("/api/reviews", require("./routes/reviewRoutes"));


// Error handling middleware (optional but useful)
app.use((err, req, res, next) => {
  console.error("Internal error:", err.message);
  res.status(500).json({ message: "Internal Server Error" });
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
