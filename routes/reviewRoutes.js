const express = require("express");
const router = express.Router();
const { createReview, getReviewsByGig } = require("../controllers/reviewController");
const { verifyToken } = require("../middleware/verifyToken");

router.post("/:gigId", verifyToken, createReview);
router.get("/:gigId", getReviewsByGig);

module.exports = router;
