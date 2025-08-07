const Review = require("../models/Review");

const createReview = async (req, res) => {
  try {
    const { rating, feedback } = req.body;
    const gigId = req.params.gigId;
    const userId = req.user.id;

    const alreadyReviewed = await Review.findOne({ gigId, userId });
    if (alreadyReviewed) {
      return res.status(400).json({ error: "You have already reviewed this gig." });
    }

    const newReview = new Review({ gigId, userId, rating, feedback });
    await newReview.save();
    res.status(201).json(newReview);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getReviewsByGig = async (req, res) => {
  try {
    const gigId = req.params.gigId;
    const reviews = await Review.find({ gigId }).populate("userId", "name avatar");
    res.status(200).json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { createReview, getReviewsByGig };
