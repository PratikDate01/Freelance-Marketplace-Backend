const Gig = require("../models/Gig");

const Review = require("../models/Review");

// ✅ Create a new gig with optional image upload
async function createGig(req, res) {
  try {
    const { title, category, description, price, deliveryTime } = req.body;
    const sellerId = req.user?.id;

    if (!sellerId) {
      return res.status(400).json({ error: "Missing sellerId" });
    }

    let imageUrl = "";
    if (req.file && req.file.path) {
      imageUrl = req.file.path; // Cloudinary or Multer image path
    }

    const newGig = new Gig({
      title,
      category,
      description,
      price,
      deliveryTime,
      image: imageUrl,
      sellerId,
    });

    await newGig.save();
    res.status(201).json({ message: "Gig created successfully", gig: newGig });
  } catch (error) {
    console.error("Gig creation failed:", error);
    res.status(500).json({ error: "Failed to create gig" });
  }
}

// ✅ Get all gigs created by the logged-in seller
const getMyGigs = async (req, res) => {
  try {
    const sellerId = req.user?.id;
    if (!sellerId) return res.status(401).json({ error: "Unauthorized" });

    const gigs = await Gig.find({ sellerId });
    res.status(200).json(gigs);
  } catch (error) {
    console.error("Error getting gigs:", error);
    res.status(500).json({ error: "Failed to fetch gigs" });
  }
};

// ✅ Delete a gig by seller
const deleteGig = async (req, res) => {
  try {
    const gigId = req.params.id;
    const sellerId = req.user?.id;

    const gig = await Gig.findById(gigId);
    if (!gig) return res.status(404).json({ error: "Gig not found" });

    if (gig.sellerId.toString() !== sellerId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    await Gig.findByIdAndDelete(gigId);
    res.status(200).json({ message: "Gig deleted successfully" });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: "Server error while deleting gig" });
  }
};

// ✅ Update a gig by seller
const updateGig = async (req, res) => {
  try {
    const gig = await Gig.findById(req.params.id);
    if (!gig) return res.status(404).json({ message: "Gig not found" });

    if (gig.sellerId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const updated = await Gig.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );

    res.status(200).json(updated);
  } catch (err) {
    res.status(500).json({ message: "Failed to update gig", error: err.message });
  }
};

// ✅ Get all gigs (for client browsing)
const getAllGigs = async (req, res) => {
  try {
    const gigs = await Gig.find().populate("sellerId", "name email avatar");
    res.status(200).json(gigs);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch gigs" });
  }
};

// ✅ Get single gig with full Fiverr-style seller info
const getGigById = async (req, res) => {
  try {
    const gig = await Gig.findById(req.params.id)
      .populate("sellerId", "name email avatar bio location memberSince avgResponseTime")
      .populate("reviews.userId", "name");
    
    if (!gig) {
      return res.status(404).json({ message: "Gig not found" });
    }
    
    res.json(gig);
  } catch (error) {
    console.error("Error fetching gig:", error);
    res.status(500).json({ message: "Failed to fetch gig" });
  }
};


const addReviewToGig = async (req, res) => {
  try {
    console.log("Review request by user:", req.user); // ✅ Check user is defined

    const { comment, rating } = req.body;

    const review = new Review({
      gigId: req.params.id,
      user: {
        _id: req.user.id,
        name: req.user.name,
      },
      comment,
      rating,
    });

    await review.save();
    res.status(201).json({ message: "Review added" });
  } catch (err) {
    console.error("Review submission failed:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /api/gigs/:id/reviews
const getGigReviews = async (req, res) => {
  try {
    const gigId = req.params.id;
    const reviews = await Review.find({ gigId }).sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    console.error("Error fetching reviews:", err);
    res.status(500).json({ message: "Failed to fetch reviews" });
  }
};

module.exports = {
  createGig,
  getMyGigs,
  deleteGig,
  updateGig,
  getAllGigs,
  getGigById,
  addReviewToGig,
  getGigReviews,
};
