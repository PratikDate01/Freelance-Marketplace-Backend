const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    gigId: { type: mongoose.Schema.Types.ObjectId, ref: "Gig", required: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    
    // Order details
    gigTitle: { type: String, required: true },
    gigImage: { type: String },
    packageType: { type: String, enum: ["basic", "standard", "premium"], default: "basic" },
    
    // Pricing
    amount: { type: Number, required: true },
    serviceFee: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    
    // Timeline
    deliveryTime: { type: Number, required: true }, // in days
    deliveryDate: { type: Date, required: true },
    
    // Status tracking
    status: {
      type: String,
      enum: ["pending", "active", "delivered", "completed", "cancelled", "revision"],
      default: "pending",
    },
    
    // Requirements and delivery
    requirements: { type: String }, // Buyer requirements
    deliveryNote: { type: String }, // Seller delivery message
    deliveryFiles: [{
      fileName: String,
      fileUrl: String,
      fileType: String,
      fileSize: Number,
      publicId: String
    }], // Delivered files with metadata
    
    // Communication
    messages: [{
      sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      message: String,
      timestamp: { type: Date, default: Date.now },
      isSystem: { type: Boolean, default: false }
    }],
    
    // Revision tracking
    revisionCount: { type: Number, default: 0 },
    maxRevisions: { type: Number, default: 1 },
    
    // Payment
    paymentStatus: {
      type: String,
      enum: ["pending", "processing", "paid", "released", "refunded"],
      default: "pending"
    },
    paymentMethod: { type: String, default: "card" },
    paymentIntentId: { type: String }, // Stripe Payment Intent ID
    stripeChargeId: { type: String }, // Stripe Charge ID
    
    // Review
    isReviewed: { type: Boolean, default: false },
    
    // Timestamps for status changes
    statusHistory: [{
      status: String,
      timestamp: { type: Date, default: Date.now },
      note: String
    }]
  },
  { timestamps: true }
);

// Add index for better query performance
orderSchema.index({ buyerId: 1, status: 1 });
orderSchema.index({ sellerId: 1, status: 1 });
orderSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);
