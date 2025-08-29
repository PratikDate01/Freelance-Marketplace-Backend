const Order = require('../models/Order');
const User = require('../models/User');
const cloudinary = require('../config/cloudinary');
const multer = require('multer');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Maximum 5 files
  },
  fileFilter: (req, file, cb) => {
    console.log('🔍 File filter check:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });

    // Allow common file types
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|zip|rar|mp4|mov|avi|psd|ai|sketch/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/') || file.mimetype === 'application/octet-stream';

    console.log('📋 File validation:', {
      extname,
      mimetype: mimetype,
      allowed: mimetype && extname
    });

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      console.log('❌ File type rejected:', file.originalname, file.mimetype);
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed types: images, documents, videos, archives`));
    }
  }
});

// Deliver order with files
const deliverOrder = async (req, res) => {
  try {
    const { id: orderId } = req.params;
    const { deliveryNote } = req.body;
    const sellerId = req.user.id;

    console.log('🚀 Delivery request received:', {
      orderId,
      sellerId,
      deliveryNote,
      filesCount: req.files ? req.files.length : 0
    });

    // Find and validate order
    const order = await Order.findById(orderId)
      .populate('buyerId', 'name email')
      .populate('sellerId', 'name email');
      
    if (!order) {
      console.log('❌ Order not found:', orderId);
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.sellerId._id.toString() !== sellerId) {
      console.log('❌ Unauthorized delivery attempt:', {
        orderSellerId: order.sellerId._id.toString(),
        requestSellerId: sellerId
      });
      return res.status(403).json({ message: 'Not authorized to deliver this order' });
    }

    if (order.status !== 'active' && order.status !== 'revision') {
      console.log('❌ Invalid order status for delivery:', order.status);
      return res.status(400).json({ message: 'Order must be active or in revision to deliver' });
    }

    // Handle file uploads if any
    let uploadedFiles = [];
    if (req.files && req.files.length > 0) {
      console.log('📁 Processing file uploads:', req.files.length, 'files');
      
      for (const file of req.files) {
        try {
          console.log('⬆️ Uploading file:', file.originalname, 'Size:', file.size);
          
          // Upload to cloudinary
          const result = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream(
              {
                resource_type: 'auto',
                folder: 'order_deliveries',
                public_id: `${orderId}_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`
              },
              (error, result) => {
                if (error) {
                  console.error('❌ Cloudinary upload error:', error);
                  reject(error);
                } else {
                  console.log('✅ File uploaded successfully:', result.secure_url);
                  resolve(result);
                }
              }
            ).end(file.buffer);
          });

          uploadedFiles.push({
            fileName: file.originalname,
            fileUrl: result.secure_url,
            fileType: file.mimetype,
            fileSize: file.size,
            publicId: result.public_id
          });
        } catch (uploadError) {
          console.error('❌ File upload error:', uploadError);
          return res.status(500).json({ 
            message: 'Failed to upload files',
            error: uploadError.message 
          });
        }
      }
    }

    const isRevisionDelivery = order.status === 'revision';

    // Update order status and add delivery details
    order.status = 'delivered';
    order.deliveryNote = deliveryNote || '';
    order.deliveryFiles = uploadedFiles;
    order.deliveredAt = new Date();

    // Add status history
    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      status: 'delivered',
      timestamp: new Date(),
      note: isRevisionDelivery 
        ? `Revision delivered by seller (${order.revisionCount || 0}/${order.maxRevisions || 1})`
        : 'Order delivered by seller'
    });

    // Add delivery message
    const messageText = isRevisionDelivery
      ? `I've submitted the revision as requested! ${deliveryNote}`
      : `I've delivered your order! ${deliveryNote}`;
      
    order.messages = order.messages || [];
    order.messages.push({
      sender: order.sellerId._id,
      message: messageText,
      timestamp: new Date(),
      isSystem: false
    });

    await order.save();

    console.log('✅ Order delivered successfully:', {
      orderId,
      status: order.status,
      filesDelivered: uploadedFiles.length
    });

    // Return populated order
    const populatedOrder = await Order.findById(orderId)
      .populate('buyerId', 'name email')
      .populate('sellerId', 'name email')
      .populate('gigId', 'title image')
      .populate('messages.sender', 'name');

    res.json({
      message: 'Order delivered successfully',
      order: populatedOrder
    });

  } catch (error) {
    console.error('❌ Error delivering order:', error);
    res.status(500).json({ 
      message: 'Failed to deliver order',
      error: error.message 
    });
  }
};

// Accept delivery (buyer accepts the delivered work)
const acceptDelivery = async (req, res) => {
  try {
    const { id: orderId } = req.params;
    const { rating, review } = req.body;
    const buyerId = req.user.id;

    console.log('🎯 Accept delivery request:', {
      orderId,
      buyerId,
      rating,
      hasReview: !!review
    });

    // Find and validate order
    const order = await Order.findById(orderId)
      .populate('buyerId', 'name email')
      .populate('sellerId', 'name email');
      
    if (!order) {
      console.log('❌ Order not found:', orderId);
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.buyerId._id.toString() !== buyerId) {
      console.log('❌ Unauthorized accept attempt:', {
        orderBuyerId: order.buyerId._id.toString(),
        requestBuyerId: buyerId
      });
      return res.status(403).json({ message: 'Not authorized to accept this delivery' });
    }

    if (order.status !== 'delivered') {
      console.log('❌ Invalid order status for acceptance:', order.status);
      return res.status(400).json({ message: 'Order is not in delivered status' });
    }

    // Update order status
    order.status = 'completed';
    order.completedAt = new Date();
    
    // Add buyer feedback if provided
    if (rating) {
      order.buyerRating = rating;
    }
    if (review) {
      order.buyerReview = review;
    }

    // Add status history
    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      status: 'completed',
      timestamp: new Date(),
      note: 'Order completed by buyer'
    });

    // Add completion message
    const completionMessage = rating && review 
      ? `Order completed! Rating: ${rating}/5 stars. Review: "${review}"`
      : rating 
        ? `Order completed! Rating: ${rating}/5 stars.`
        : 'Order completed successfully!';
        
    order.messages = order.messages || [];
    order.messages.push({
      sender: order.buyerId._id,
      message: completionMessage,
      timestamp: new Date(),
      isSystem: true
    });

    await order.save();

    console.log('✅ Delivery accepted successfully:', {
      orderId,
      status: order.status,
      rating: order.buyerRating
    });

    // Return populated order
    const populatedOrder = await Order.findById(orderId)
      .populate('buyerId', 'name email')
      .populate('sellerId', 'name email')
      .populate('gigId', 'title image')
      .populate('messages.sender', 'name');

    res.json({
      message: 'Delivery accepted successfully',
      order: populatedOrder
    });

  } catch (error) {
    console.error('❌ Error accepting delivery:', error);
    res.status(500).json({ 
      message: 'Failed to accept delivery',
      error: error.message 
    });
  }
};

// Request revision
const requestRevision = async (req, res) => {
  try {
    const { id: orderId } = req.params;
    const { revisionNote } = req.body;
    const buyerId = req.user.id;

    // Find and validate order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.buyerId.toString() !== buyerId) {
      return res.status(403).json({ message: 'Not authorized to request revision for this order' });
    }

    if (order.status !== 'delivered') {
      return res.status(400).json({ message: 'Can only request revision for delivered orders' });
    }

    // Check revision limits
    const maxRevisions = order.maxRevisions || 2;
    const currentRevisions = order.revisionCount || 0;

    if (currentRevisions >= maxRevisions) {
      return res.status(400).json({ 
        message: `Maximum revision limit (${maxRevisions}) reached` 
      });
    }

    // Update order for revision
    order.status = 'revision';
    order.revisionCount = currentRevisions + 1;
    order.revisionNote = revisionNote || '';
    order.revisionRequestedAt = new Date();

    await order.save();

    res.json({
      message: 'Revision requested successfully',
      order: order
    });

  } catch (error) {
    console.error('Error requesting revision:', error);
    res.status(500).json({ message: 'Failed to request revision' });
  }
};

// Get delivery files for an order
const getDeliveryFiles = async (req, res) => {
  try {
    const { id: orderId } = req.params;
    const userId = req.user.id;

    // Find and validate order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if user is buyer or seller
    if (order.buyerId.toString() !== userId && order.sellerId.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized to access these files' });
    }

    res.json({
      files: order.deliveryFiles || []
    });

  } catch (error) {
    console.error('Error fetching delivery files:', error);
    res.status(500).json({ message: 'Failed to fetch delivery files' });
  }
};

module.exports = {
  deliverOrder,
  acceptDelivery,
  requestRevision,
  getDeliveryFiles,
  upload
};