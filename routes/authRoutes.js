const express = require("express");
const passport = require("passport");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { verifyToken } = require("../middleware/verifyToken");

const router = express.Router();

const CLIENT_URL = process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

// 🔐 Generate JWT Token
const generateToken = (user) => {
  return jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, {
    expiresIn: "7d",
  });
};

// ✅ Register new user
router.post("/register", async (req, res) => {
  const { email, password, name, role } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      email,
      name,
      password: hashedPassword,
      role,
      isOAuth: false,
    });

    const token = generateToken(newUser);

    res.status(201).json({
      message: "Registration successful.",
      user: {
        id: newUser._id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
      },
      token,
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ message: "Server error during registration." });
  }
});

// ✅ Login with email & password
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user || user.isOAuth) {
      return res.status(400).json({ message: "Invalid credentials or use Google login." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Incorrect password." });

    const token = generateToken(user);

    res.status(200).json({
      message: "Login successful.",
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      token,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error during login." });
  }
});

// ✅ Google OAuth Start (stateless)
router.get("/google", passport.authenticate("google", {
  scope: ["profile", "email"],
  session: false,
}));

// ✅ Google OAuth Callback (issue JWT and redirect)
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${CLIENT_URL}`,
    session: false,
  }),
  (req, res) => {
    try {
      const token = generateToken(req.user);
      // Decide frontend base by env to avoid wrong redirects
      const frontendUrl = process.env.NODE_ENV === "production"
        ? (process.env.FRONTEND_URL || process.env.CLIENT_URL || "https://freelance-marketplace-frontend-v2sy.vercel.app")
        : "http://localhost:3000";
      // Redirect to both supported paths: primary /oauth/redirect; keep token param for existing handler
      const redirectUrl = `${frontendUrl}/oauth/redirect?token=${encodeURIComponent(token)}`;
      return res.redirect(redirectUrl);
    } catch (err) {
      console.error("OAuth callback error", err);
      return res.redirect(`${CLIENT_URL}`);
    }
  }
);

// ❌ Remove session-dependent endpoints in JWT-only setup
// Kept /me which uses JWT
router.get("/me", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      profilePicture: user.profilePicture,
      isOAuth: user.isOAuth
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
