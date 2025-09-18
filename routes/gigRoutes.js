const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/verifyToken");
const upload = require("../middleware/upload");

const {
  createGig,
  getMyGigs,
  deleteGig,
  updateGig,
  getAllGigs,
  getGigById,
  addReviewToGig,
  getGigReviews,
} = require("../controllers/gigController");

// ✅ File Upload
router.post("/", verifyToken, upload.single("image"), createGig);

const {
  saveGig,
  unsaveGig,
  getSavedGigs,
  isGigSaved
} = require("../controllers/savedGigController");

// ✅ Specific routes MUST come before parameterized routes
router.get("/mine", verifyToken, getMyGigs);
router.get("/", getAllGigs);

// ✅ Saved gigs routes
router.post("/:id/save", verifyToken, saveGig);
router.delete("/:id/save", verifyToken, unsaveGig);
router.get("/saved", verifyToken, getSavedGigs);
router.get("/:id/saved", verifyToken, isGigSaved);

// ✅ Gig CRUD with ID parameters
router.delete("/:id", verifyToken, deleteGig);
router.put("/:id", verifyToken, upload.single("image"), updateGig);
router.get("/:id", getGigById);

// ✅ Reviews
router.post("/:id/reviews", verifyToken, addReviewToGig);
router.get("/:id/reviews", getGigReviews);

module.exports = router;
