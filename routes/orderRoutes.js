const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/verifyToken");

const {
  createOrder,
  processPayment,
  getBuyerOrders,
  getBuyerStats,
  getSellerOrders,
  getSellerStats,
  getOrderById,
  deliverOrder,
  acceptDelivery,
  requestRevision,
  addMessage,
  cancelOrder
} = require("../controllers/orderController");

// Create order
router.post("/", verifyToken, createOrder);

// Process payment
router.post("/:id/payment", verifyToken, processPayment);

// Get orders
router.get("/buyer", verifyToken, getBuyerOrders);
router.get("/buyer/stats", verifyToken, getBuyerStats);
router.get("/seller", verifyToken, getSellerOrders);
router.get("/seller/stats", verifyToken, getSellerStats);

// Get single order
router.get("/:id", verifyToken, getOrderById);

// Order actions
router.post("/:id/deliver", verifyToken, deliverOrder);
router.post("/:id/accept", verifyToken, acceptDelivery);
router.post("/:id/revision", verifyToken, requestRevision);
router.post("/:id/cancel", verifyToken, cancelOrder);

// Messages
router.post("/:id/messages", verifyToken, addMessage);

module.exports = router;
