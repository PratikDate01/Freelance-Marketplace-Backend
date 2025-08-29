const mongoose = require("mongoose");

const gigSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String },
    price: { type: Number, required: true },
    deliveryTime: { type: Number, required: true },
    image: { type: String }, // Single main image
    images: [String], // Additional images array
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    packages: {
      basic: {
        title: String,
        description: String,
        price: Number,
        deliveryTime: Number,
      },
     
    },
   reviews: [
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    name: String,
    rating: Number,
    comment: String,
    createdAt: { type: Date, default: Date.now },
  },
],
  averageRating: { type: Number, default: 0 },

    totalReviews: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Gig", gigSchema);
