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
    profilePicture: { type: String, default: "" },  // Alternative field name for consistency
    bio: { type: String, default: "" },             // Short description about the freelancer
    location: { type: String, default: "" },        // Country / city
    avgResponseTime: { type: String, default: "1 hour" }, // Estimated response time
    memberSince: { type: Date, default: Date.now },       // Join date
    
    // ✅ Payment Integration
    stripeAccountId: { type: String }, // Stripe Connect Account ID for sellers
    stripeCustomerId: { type: String }, // Stripe Customer ID for buyers
    paymentSetupComplete: { type: Boolean, default: false }, // Whether payment setup is done
  },
  {
    timestamps: true, // adds createdAt and updatedAt automatically
  }
);

module.exports = mongoose.model("User", userSchema);
