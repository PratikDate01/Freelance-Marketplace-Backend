const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/verifyToken');

const {
  createPaymentIntent,
  confirmPayment,
  releasePayment,
  refundPayment,
  getSellerEarnings,
  getPaymentHistory,
  processWithdrawal,
  createDispute,
  getPlatformStats,
  getPaymentNotifications
} = require('../controllers/paymentController');

// Create payment intent for order
router.post('/create-payment-intent', verifyToken, createPaymentIntent);

// Confirm payment after successful charge
router.post('/confirm-payment', verifyToken, confirmPayment);

// Release payment to seller (when order completed)
router.post('/release/:orderId', verifyToken, releasePayment);

// Refund payment (for cancellations)
router.post('/refund/:orderId', verifyToken, refundPayment);

// Get seller earnings
router.get('/earnings', verifyToken, getSellerEarnings);

// Get seller earnings (alternative endpoint)
router.get('/seller/earnings', verifyToken, getSellerEarnings);

// Get payment history
router.get('/history', verifyToken, getPaymentHistory);

// Get payment notifications
router.get('/notifications', verifyToken, getPaymentNotifications);

module.exports = router;