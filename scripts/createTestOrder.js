const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Order = require('../models/Order');
const User = require('../models/User');
const Gig = require('../models/Gig');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/freelancermarketplace');

async function createTestOrder() {
  try {
    // Find a client and freelancer
    const client = await User.findOne({ role: 'client' });
    const freelancer = await User.findOne({ role: 'freelancer' });
    
    if (!client || !freelancer) {
      console.log('Please ensure you have at least one client and one freelancer in the database');
      return;
    }

    // Find or create a gig
    let gig = await Gig.findOne({ sellerId: freelancer._id });
    if (!gig) {
      gig = new Gig({
        title: 'Test Web Development Service',
        description: 'I will create a professional website for you',
        category: 'Web Development',
        price: 5000,
        deliveryTime: 7,
        image: 'https://via.placeholder.com/300x200',
        sellerId: freelancer._id
      });
      await gig.save();
      console.log('Created test gig:', gig.title);
    }

    // Create test order in "delivered" status
    const testOrder = new Order({
      gigId: gig._id,
      buyerId: client._id,
      sellerId: freelancer._id,
      gigTitle: gig.title,
      gigImage: gig.image,
      packageType: 'basic',
      amount: gig.price,
      serviceFee: Math.round(gig.price * 0.1), // 10% service fee
      totalAmount: Math.round(gig.price * 1.1),
      deliveryTime: gig.deliveryTime,
      deliveryDate: new Date(Date.now() + gig.deliveryTime * 24 * 60 * 60 * 1000),
      status: 'delivered', // Set to delivered so client can test accept/revision
      paymentStatus: 'paid',
      requirements: 'Please create a modern, responsive website with clean design.',
      deliveryNote: 'I have completed your website as requested. Please review and let me know if you need any changes.',
      deliveryFiles: ['https://example.com/delivered-file-1.zip'],
      revisionCount: 0,
      maxRevisions: 2,
      statusHistory: [
        {
          status: 'pending',
          note: 'Order placed and payment processed',
          timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
        },
        {
          status: 'active',
          note: 'Order started by seller',
          timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) // 6 days ago
        },
        {
          status: 'delivered',
          note: 'Order delivered by seller',
          timestamp: new Date() // Now
        }
      ],
      messages: [
        {
          sender: client._id,
          message: 'Hi! I\'m excited to work with you on this project.',
          timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
        },
        {
          sender: freelancer._id,
          message: 'Thank you! I\'ll start working on your website right away.',
          timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000 + 60000)
        },
        {
          sender: freelancer._id,
          message: 'Your website is ready! Please check the delivered files.',
          timestamp: new Date()
        }
      ]
    });

    await testOrder.save();

    console.log('✅ Test order created successfully!');
    console.log('Order ID:', testOrder._id);
    console.log('Client:', client.name || client.email);
    console.log('Freelancer:', freelancer.name || freelancer.email);
    console.log('Status:', testOrder.status);
    console.log('\nYou can now test:');
    console.log('1. Client can view order at: /client/orders/' + testOrder._id);
    console.log('2. Client can Accept Delivery or Request Revision');
    console.log('3. Freelancer can view order at: /freelancer/orders/' + testOrder._id);
    console.log('4. If revision is requested, freelancer can submit revision');

  } catch (error) {
    console.error('Error creating test order:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Also create an order in "revision" status for testing
async function createRevisionTestOrder() {
  try {
    const client = await User.findOne({ role: 'client' });
    const freelancer = await User.findOne({ role: 'freelancer' });
    const gig = await Gig.findOne({ sellerId: freelancer._id });

    if (!client || !freelancer || !gig) {
      console.log('Missing required data for revision test order');
      return;
    }

    const revisionOrder = new Order({
      gigId: gig._id,
      buyerId: client._id,
      sellerId: freelancer._id,
      gigTitle: gig.title + ' (Revision Test)',
      gigImage: gig.image,
      packageType: 'basic',
      amount: gig.price,
      serviceFee: Math.round(gig.price * 0.1),
      totalAmount: Math.round(gig.price * 1.1),
      deliveryTime: gig.deliveryTime,
      deliveryDate: new Date(Date.now() + gig.deliveryTime * 24 * 60 * 60 * 1000),
      status: 'revision', // Set to revision status
      paymentStatus: 'paid',
      requirements: 'Please create a modern website with blue color scheme.',
      deliveryNote: 'Here is your website with the requested features.',
      revisionCount: 1,
      maxRevisions: 2,
      statusHistory: [
        {
          status: 'pending',
          note: 'Order placed and payment processed',
          timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
        },
        {
          status: 'active',
          note: 'Order started by seller',
          timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
        },
        {
          status: 'delivered',
          note: 'Order delivered by seller',
          timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
        },
        {
          status: 'revision',
          note: 'Revision requested (1/2)',
          timestamp: new Date()
        }
      ],
      messages: [
        {
          sender: freelancer._id,
          message: 'Your website is ready! Please review.',
          timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
        },
        {
          sender: client._id,
          message: 'I need some revisions: Could you please change the color scheme to blue instead of green? Also, make the header more prominent.',
          timestamp: new Date()
        }
      ]
    });

    await revisionOrder.save();
    console.log('✅ Revision test order created!');
    console.log('Order ID:', revisionOrder._id);
    console.log('Status:', revisionOrder.status);
    console.log('Freelancer can now submit revision at: /freelancer/orders/' + revisionOrder._id);

  } catch (error) {
    console.error('Error creating revision test order:', error);
  }
}

// Run both functions
async function createAllTestOrders() {
  await createTestOrder();
  await createRevisionTestOrder();
}

createAllTestOrders();