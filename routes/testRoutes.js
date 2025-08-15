const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/verifyToken");
const Order = require("../models/Order");

// Test route to update order status (for development/testing only)
router.post("/update-order-status/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const validStatuses = ['pending', 'active', 'delivered', 'completed', 'cancelled', 'revision'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        message: "Invalid status", 
        validStatuses 
      });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if user is buyer or seller
    const userId = req.user.id;
    if (order.buyerId.toString() !== userId && order.sellerId.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Update order status
    order.status = status;
    
    // Add to status history
    order.statusHistory.push({
      status: status,
      note: `Status updated to ${status} for testing`,
      timestamp: new Date()
    });

    // Add specific fields based on status
    if (status === 'delivered' && !order.deliveryNote) {
      order.deliveryNote = "Test delivery - order marked as delivered for testing purposes.";
    }
    
    if (status === 'revision') {
      order.revisionCount = Math.min(order.revisionCount + 1, order.maxRevisions);
      order.messages.push({
        sender: order.buyerId,
        message: "I need some revisions: This is a test revision request for development purposes.",
        isSystem: false,
        timestamp: new Date()
      });
    }

    await order.save();

    const populatedOrder = await Order.findById(order._id)
      .populate("gigId", "title image price")
      .populate("buyerId", "name email")
      .populate("sellerId", "name email");

    res.json({
      message: `Order status updated to ${status}`,
      order: populatedOrder
    });

  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ message: "Failed to update order status" });
  }
});

// Get all orders for testing
router.get("/orders", verifyToken, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("gigId", "title")
      .populate("buyerId", "name email")
      .populate("sellerId", "name email")
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

module.exports = router;