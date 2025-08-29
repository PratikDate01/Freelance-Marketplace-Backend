const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true
    },
    
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    
    // Message content
    content: {
      type: String,
      required: true
    },
    
    // Message type
    messageType: {
      type: String,
      enum: ["text", "file", "image", "system", "order_update"],
      default: "text"
    },
    
    // File attachments
    attachments: [{
      fileName: String,
      fileUrl: String,
      fileType: String,
      fileSize: Number
    }],
    
    // Message status
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent"
    },
    
    // Read receipts
    readBy: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      readAt: {
        type: Date,
        default: Date.now
      }
    }],
    
    // Reply to another message
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null
    },
    
    // System message metadata
    systemData: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    
    // Message reactions
    reactions: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      emoji: String,
      timestamp: {
        type: Date,
        default: Date.now
      }
    }],
    
    // Soft delete
    isDeleted: {
      type: Boolean,
      default: false
    },
    
    deletedAt: Date,
    
    // Edit history
    editHistory: [{
      content: String,
      editedAt: {
        type: Date,
        default: Date.now
      }
    }],
    
    isEdited: {
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
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ status: 1 });
messageSchema.index({ messageType: 1 });

// Virtual for formatted timestamp
messageSchema.virtual('formattedTime').get(function() {
  return this.createdAt.toLocaleTimeString();
});

module.exports = mongoose.model("Message", messageSchema);