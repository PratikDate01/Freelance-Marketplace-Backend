const Review = require("../models/Review");

const createReview = async (req, res) => {
  try {
    const { rating, feedback } = req.body;
    const gigId = req.params.gigId;
    const user = { _id: req.user.id, name: req.user.name };

    const alreadyReviewed = await Review.findOne({ gigId, 'user._id': user._id });
    if (alreadyReviewed) {
      return res.status(400).json({ error: "You have already reviewed this gig." });
    }

    const newReview = new Review({ gigId, user, rating, comment: feedback });
    await newReview.save();
    res.status(201).json(newReview);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getReviewsByGig = async (req, res) => {
  try {
    const gigId = req.params.gigId;
    const reviews = await Review.find({ gigId }).sort({ createdAt: -1 });
    res.status(200).json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { createReview, getReviewsByGig };
