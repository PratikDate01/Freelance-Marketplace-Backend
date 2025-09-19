const mongoose = require('mongoose');
const Order = require('../models/Order');

// Test script to verify order details API
const testOrderDetails = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/freelance-marketplace');

    console.log('Connected to MongoDB');

    // Find a sample order
    const order = await Order.findOne().populate('gigId buyerId sellerId');

    if (!order) {
      console.log('No orders found in database');
      return;
    }

    console.log('Sample order found:');
    console.log('Order ID:', order._id);
    console.log('Gig Title:', order.gigTitle);
    console.log('Gig Image:', order.gigImage);
    console.log('Buyer Name:', order.buyerId?.name);
    console.log('Seller Name:', order.sellerId?.name);
    console.log('Amount:', order.amount);
    console.log('Status:', order.status);
    console.log('Package Type:', order.packageType);
    console.log('Delivery Time:', order.deliveryTime);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
};

testOrderDetails();