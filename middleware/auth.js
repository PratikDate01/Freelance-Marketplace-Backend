const jwt = require("jsonwebtoken");
const User = require("../models/User"); // Make sure this path is correct

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(403).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch (err) {
    console.error("Token verification failed:", err.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

// Google OAuth callback handler (used if you are integrating Google login)
const googleCallback = async (req, res) => {
  try {
    const { profile } = req.user; // You get this from Passport's Google Strategy

    let user = await User.findOne({ email: profile.email });

    if (!user) {
      user = await User.create({
        email: profile.email,
        name: profile.name,
        isOAuth: true,
        // You can save avatar or other fields if needed
      });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    const redirectUrl = `http://localhost:3000/oauth-callback?token=${token}&user=${encodeURIComponent(JSON.stringify(user))}`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error("Google OAuth callback failed:", error);
    res.redirect("http://localhost:3000/signin?error=oauth_failed");
  }
};

// Export both the middleware and OAuth callback (if used)
module.exports = {
  verifyToken,
  googleCallback,
};
