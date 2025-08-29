const mongoose = require('mongoose');
require('dotenv').config();

const Order = require('../models/Order');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/freelancermarketplace');

async function updateOrdersToDelivered() {
  try {
    // Find orders that are in 'active' status and update them to 'delivered'
    const result = await Order.updateMany(
      { status: 'active' },
      { 
        $set: { 
          status: 'delivered',
          deliveryNote: 'Order has been completed and delivered for testing purposes.',
          deliveryFiles: []
        },
        $push: {
          statusHistory: {
            status: 'delivered',
            note: 'Order delivered by seller (updated for testing)',
            timestamp: new Date()
          },
          messages: {
            sender: null, // Will be populated with seller ID in real scenario
            message: 'Your order has been delivered! Please review and provide feedback.',
            isSystem: true,
            timestamp: new Date()
          }
        }
      }
    );

    console.log(`✅ Updated ${result.modifiedCount} orders to 'delivered' status`);

    // Also create a test order in revision status
    const orders = await Order.find({ status: 'delivered' }).limit(1);
    if (orders.length > 0) {
      const order = orders[0];
      order.status = 'revision';
      order.revisionCount = 1;
      order.statusHistory.push({
        status: 'revision',
        note: 'Revision requested by client (1/2)',
        timestamp: new Date()
      });
      order.messages.push({
        sender: order.buyerId,
        message: 'I need some revisions: Could you please make the design more modern and add a contact form?',
        isSystem: false,
        timestamp: new Date()
      });
      await order.save();
      console.log(`✅ Created revision test order: ${order._id}`);
    }

    console.log('\n🎯 Test Orders Ready:');
    console.log('1. Orders in "delivered" status - clients can Accept Delivery or Request Revision');
    console.log('2. Orders in "revision" status - freelancers can Submit Revision');

  } catch (error) {
    console.error('Error updating orders:', error);
  } finally {
    mongoose.connection.close();
  }
}

updateOrdersToDelivered();