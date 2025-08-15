const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    
    title: {
      type: String,
      required: true
    },
    
    message: {
      type: String,
      required: true
    },
    
    type: {
      type: String,
      enum: [
        "order_placed",
        "order_delivered", 
        "order_completed",
        "order_cancelled",
        "payment_received",
        "message_received",
        "review_received",
        "gig_approved",
        "system"
      ],
      required: true
    },
    
    // Related entities
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null
    },
    
    gigId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gig",
      default: null
    },
    
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    
    // Notification status
    isRead: {
      type: Boolean,
      default: false
    },
    
    readAt: {
      type: Date,
      default: null
    },
    
    // Action URL
    actionUrl: {
      type: String,
      default: null
    },
    
    // Metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for better performance
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ type: 1 });

// Auto-delete old notifications after 30 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model("Notification", notificationSchema);