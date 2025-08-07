const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: { type: String }, // For non-OAuth users
    isOAuth: { type: Boolean, default: false },
    role: {
      type: String,
      enum: ["client", "freelancer"],
      default: "client",
    },
    googleId: { type: String }, // For Google OAuth

    // ✅ Fiverr-style seller profile enhancements
    avatar: { type: String, default: "" },         // Seller profile image
    bio: { type: String, default: "" },             // Short description about the freelancer
    location: { type: String, default: "" },        // Country / city
    avgResponseTime: { type: String, default: "1 hour" }, // Estimated response time
    memberSince: { type: Date, default: Date.now },       // Join date
  },
  {
    timestamps: true, // adds createdAt and updatedAt automatically
  }
);

module.exports = mongoose.model("User", userSchema);
