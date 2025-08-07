const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { createOrder, getMyOrders } = require("../controllers/orderController");

router.post("/", verifyToken, createOrder);
router.get("/", verifyToken, getMyOrders);

module.exports = router;
