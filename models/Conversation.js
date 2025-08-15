const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    participants: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }],
    
    // Link to order if conversation is order-related
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null
    },
    
    // Link to gig if conversation is gig inquiry
    gigId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gig",
      default: null
    },
    
    // Conversation type
    type: {
      type: String,
      enum: ["order", "inquiry", "general"],
      default: "general"
    },
    
    // Last message for quick access
    lastMessage: {
      content: String,
      sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      timestamp: {
        type: Date,
        default: Date.now
      },
      messageType: {
        type: String,
        enum: ["text", "file", "image", "system"],
        default: "text"
      }
    },
    
    // Unread message counts for each participant
    unreadCount: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      count: {
        type: Number,
        default: 0
      }
    }],
    
    // Conversation status
    status: {
      type: String,
      enum: ["active", "archived", "blocked"],
      default: "active"
    },
    
    // Metadata
    title: String, // Optional conversation title
    isGroup: {
      type: Boolean,
      default: false
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for better performance
conversationSchema.index({ participants: 1 });
conversationSchema.index({ orderId: 1 });
conversationSchema.index({ gigId: 1 });
conversationSchema.index({ "lastMessage.timestamp": -1 });

// Virtual for message count
conversationSchema.virtual('messageCount', {
  ref: 'Message',
  localField: '_id',
  foreignField: 'conversationId',
  count: true
});

module.exports = mongoose.model("Conversation", conversationSchema);