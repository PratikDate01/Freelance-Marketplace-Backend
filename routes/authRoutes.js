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

// ✅ Google OAuth Start
router.get("/google", passport.authenticate("google", {
  scope: ["profile", "email"],
}));

// ✅ Google OAuth Callback
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${CLIENT_URL}/signin`,
    session: true,
  }),
  (req, res) => {
    try {
      // Issue JWT directly on callback and pass to frontend via query param
      const token = generateToken(req.user);
      const redirectUrl = `${CLIENT_URL}/oauth-redirect?token=${encodeURIComponent(token)}`;
      return res.redirect(redirectUrl);
    } catch (err) {
      console.error("OAuth callback error:", err);
      return res.redirect(`${CLIENT_URL}/signin`);
    }
  }
);

// ✅ Get OAuth Authenticated User and Issue JWT
router.get("/success", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Not authenticated" });
  }

  try {
    let user = await User.findOne({ email: req.user.email });

    // If user doesn't exist, create them
    if (!user) {
      user = await User.create({
        email: req.user.email,
        name: req.user.displayName || req.user.name || "Google User",
        isOAuth: true,
        role: "client", // Default role
      });
    }

    const token = generateToken(user);

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role || "client",
      },
      token,
    });
  } catch (err) {
    console.error("OAuth success error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Get current user (session check)
router.get("/current-user", (req, res) => {
  if (req.isAuthenticated()) {
    res.json(req.user);
  } else {
    res.status(401).json({ message: "Not authenticated" });
  }
});

// ✅ Get current authenticated user (JWT)
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

// ✅ Logout (destroy session)
router.get("/logout", (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: err });
    res.redirect(CLIENT_URL);
  });
});

module.exports = router;
