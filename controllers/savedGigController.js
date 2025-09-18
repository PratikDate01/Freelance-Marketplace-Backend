const SavedGig = require("../models/SavedGig");

// Save a gig for a user
const saveGig = async (req, res) => {
  try {
    const { id: gigId } = req.params;
    const userId = req.user.id;

    // Check if already saved
    const existingSave = await SavedGig.findOne({ userId, gigId });
    if (existingSave) {
      return res.status(400).json({ message: "Gig already saved" });
    }

    // Create new saved gig
    const savedGig = new SavedGig({ userId, gigId });
    await savedGig.save();

    res.status(201).json({ message: "Gig saved successfully" });
  } catch (error) {
    console.error("Error saving gig:", error);
    res.status(500).json({ message: "Failed to save gig" });
  }
};

// Unsave a gig for a user
const unsaveGig = async (req, res) => {
  try {
    const { id: gigId } = req.params;
    const userId = req.user.id;

    const result = await SavedGig.findOneAndDelete({ userId, gigId });
    if (!result) {
      return res.status(404).json({ message: "Saved gig not found" });
    }

    res.json({ message: "Gig unsaved successfully" });
  } catch (error) {
    console.error("Error unsaving gig:", error);
    res.status(500).json({ message: "Failed to unsave gig" });
  }
};

// Get all saved gigs for a user
const getSavedGigs = async (req, res) => {
  try {
    const userId = req.user.id;

    const savedGigs = await SavedGig.find({ userId })
      .populate({
        path: 'gigId',
        populate: {
          path: 'sellerId',
          select: 'name email avatar'
        }
      })
      .sort({ createdAt: -1 });

    res.json(savedGigs);
  } catch (error) {
    console.error("Error fetching saved gigs:", error);
    res.status(500).json({ message: "Failed to fetch saved gigs" });
  }
};

// Check if a gig is saved by a user
const isGigSaved = async (req, res) => {
  try {
    const { id: gigId } = req.params;
    const userId = req.user.id;

    const savedGig = await SavedGig.findOne({ userId, gigId });
    res.json({ isSaved: !!savedGig });
  } catch (error) {
    console.error("Error checking if gig is saved:", error);
    res.status(500).json({ message: "Failed to check saved status" });
  }
};

module.exports = {
  saveGig,
  unsaveGig,
  getSavedGigs,
  isGigSaved
};
