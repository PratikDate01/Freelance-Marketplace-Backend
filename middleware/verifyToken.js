const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // ensure ID and name are available here
    console.log("Token verified for user:", { id: decoded.id, name: decoded.name });
    next();
  } catch (err) {
    console.error("Token verification failed:", err.message);
    return res.status(403).json({ error: "Invalid token" });
  }
};

module.exports = { verifyToken };
