const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/verifyToken');
const {
  deliverOrder,
  acceptDelivery,
  requestRevision,
  getDeliveryFiles,
  upload
} = require('../controllers/deliveryController');

// All routes require authentication
router.use(verifyToken);

// Multer error handling middleware
const handleMulterError = (err, req, res, next) => {
  console.log('🚨 Multer error:', err);
  
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      message: 'File too large. Maximum size is 10MB per file.',
      error: 'FILE_TOO_LARGE'
    });
  }
  
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      message: 'Too many files. Maximum is 5 files.',
      error: 'TOO_MANY_FILES'
    });
  }
  
  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(400).json({
      message: err.message,
      error: 'INVALID_FILE_TYPE'
    });
  }
  
  next(err);
};

// Deliver order with file uploads
router.post('/orders/:id/deliver', 
  (req, res, next) => {
    console.log('📤 Delivery request received for order:', req.params.id);
    console.log('📋 Request headers:', {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length']
    });
    next();
  },
  upload.array('deliveryFiles', 5), 
  handleMulterError,
  deliverOrder
);

// Accept delivery (buyer accepts the work)
router.post('/orders/:id/accept', acceptDelivery);

// Request revision (buyer requests changes)
router.post('/orders/:id/revision', requestRevision);

// Get delivery files for an order
router.get('/orders/:id/files', getDeliveryFiles);

module.exports = router;