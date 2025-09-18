const mongoose = require("mongoose");

const savedGigSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    gigId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gig",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to prevent duplicate saves
savedGigSchema.index({ userId: 1, gigId: 1 }, { unique: true });

module.exports = mongoose.model("SavedGig", savedGigSchema);
