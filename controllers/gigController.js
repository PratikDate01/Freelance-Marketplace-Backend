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
      console.log("✅ Image uploaded successfully:", imageUrl);
    } else {
      console.log("❌ No image file received in request");
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
    console.log("✅ Gig saved to database:", {
      id: newGig._id,
      title: newGig.title,
      image: newGig.image,
      hasImage: !!newGig.image
    });
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

    // Prepare update data
    const updateData = { ...req.body };
    
    // Handle image upload if new image is provided
    if (req.file && req.file.path) {
      updateData.image = req.file.path;
      console.log("✅ New image uploaded for gig update:", updateData.image);
    }

    const updated = await Gig.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    );

    console.log("✅ Gig updated successfully:", {
      id: updated._id,
      title: updated.title,
      image: updated.image
    });

    res.status(200).json(updated);
  } catch (err) {
    console.error("Update gig error:", err);
    res.status(500).json({ message: "Failed to update gig", error: err.message });
  }
};

// ✅ Get all gigs (for client browsing) with pagination
const getAllGigs = async (req, res) => {
  try {
    const { page = 1, limit = 20, category, search } = req.query;
    const query = {};

    if (category) query.category = category;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const gigs = await Gig.find(query)
      .populate("sellerId", "name email avatar")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Gig.countDocuments(query);

    console.log(`📋 Fetching gigs - page ${page}, limit ${limit}, total ${total}`);

    res.status(200).json({
      gigs,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error("Error fetching gigs:", error);
    res.status(500).json({ message: "Failed to fetch gigs" });
  }
};

// ✅ Get single gig with full Fiverr-style seller info
const getGigById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid gig ID format" });
    }
    
    const gig = await Gig.findById(id)
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
    const gigId = req.params.id;
    const userId = req.user.id;
    const userName = req.user.name;

    // Find the gig
    const gig = await Gig.findById(gigId);
    if (!gig) {
      return res.status(404).json({ message: "Gig not found" });
    }

    // Check if user already reviewed this gig
    const existingReview = gig.reviews.find(review => review.userId.toString() === userId);
    if (existingReview) {
      return res.status(400).json({ message: "You have already reviewed this gig" });
    }

    // Add review to gig
    const newReview = {
      userId,
      name: userName,
      rating: Number(rating),
      comment,
      createdAt: new Date()
    };

    gig.reviews.push(newReview);

    // Update average rating and total reviews
    const totalRating = gig.reviews.reduce((sum, review) => sum + review.rating, 0);
    gig.averageRating = totalRating / gig.reviews.length;
    gig.totalReviews = gig.reviews.length;

    await gig.save();

    res.status(201).json({ message: "Review added successfully" });
  } catch (err) {
    console.error("Review submission failed:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// GET /api/gigs/:id/reviews
const getGigReviews = async (req, res) => {
  try {
    const gigId = req.params.id;
    const gig = await Gig.findById(gigId).populate("reviews.userId", "name");
    if (!gig) {
      return res.status(404).json({ message: "Gig not found" });
    }
    const reviews = gig.reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
