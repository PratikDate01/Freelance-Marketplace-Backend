const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    gigId: { type: mongoose.Schema.Types.ObjectId, ref: "Gig", required: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "in-progress", "completed", "cancelled"],
      default: "pending",
    },
    amount: { type: Number, required: true },
    deliveryDate: { type: Date, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
