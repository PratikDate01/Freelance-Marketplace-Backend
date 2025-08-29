const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// @desc    Register a new user
// @route   POST /api/auth/register
exports.registerUser = async (req, res) => {
  const { name, email, password, role } = req.body;

  try {
    // Basic role validation
    if (!['client', 'freelancer'].includes(role)) {
      return res.status(400).json({ message: 'Invalid user role' });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      isOAuth: false
    });

    res.status(201).json({
      message: 'Registered successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Login user with email & password
// @route   POST /api/auth/login
exports.loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user || user.isOAuth) {
      return res.status(404).json({ message: 'User not found or use Google login' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: 'Incorrect password' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Search users
// @route   GET /api/users/search
exports.searchUsers = async (req, res) => {
  try {
    const { query, role, limit = 10 } = req.query;
    const currentUserId = req.user.id;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ message: 'Search query must be at least 2 characters' });
    }
    
    const searchFilter = {
      _id: { $ne: currentUserId }, // Exclude current user
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    };
    
    // Filter by role if specified
    if (role && ['client', 'freelancer'].includes(role)) {
      searchFilter.role = role;
    }
    
    const users = await User.find(searchFilter)
      .select('name email role profilePicture')
      .limit(parseInt(limit))
      .sort({ name: 1 });
    
    res.json(users);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get user activity
// @route   GET /api/users/activity
exports.getUserActivity = async (req, res) => {
  try {
    const userId = req.user.id;
    const Order = require('../models/Order');
    const Gig = require('../models/Gig');
    const Review = require('../models/Review');
    
    // Get recent activities based on user role
    const user = await User.findById(userId);
    const activities = [];
    
    if (user.role === 'client') {
      // Get recent orders as buyer
      const recentOrders = await Order.find({ buyerId: userId })
        .populate('gigId', 'title')
        .populate('sellerId', 'name')
        .sort({ createdAt: -1 })
        .limit(10);
      
      recentOrders.forEach(order => {
        activities.push({
          type: 'order_placed',
          title: `Ordered "${order.gigId?.title || 'Unknown Gig'}"`,
          description: `From ${order.sellerId?.name || 'Unknown Seller'}`,
          date: order.createdAt,
          status: order.status,
          amount: order.totalAmount
        });
      });
      
      // Get recent reviews given
      const recentReviews = await Review.find({ reviewerId: userId })
        .populate('gigId', 'title')
        .sort({ createdAt: -1 })
        .limit(5);
      
      recentReviews.forEach(review => {
        activities.push({
          type: 'review_given',
          title: `Reviewed "${review.gigId?.title || 'Unknown Gig'}"`,
          description: `Rated ${review.rating} stars`,
          date: review.createdAt,
          rating: review.rating
        });
      });
      
    } else if (user.role === 'freelancer') {
      // Get recent orders as seller
      const recentOrders = await Order.find({ sellerId: userId })
        .populate('gigId', 'title')
        .populate('buyerId', 'name')
        .sort({ createdAt: -1 })
        .limit(10);
      
      recentOrders.forEach(order => {
        activities.push({
          type: 'order_received',
          title: `New order for "${order.gigId?.title || 'Unknown Gig'}"`,
          description: `From ${order.buyerId?.name || 'Unknown Buyer'}`,
          date: order.createdAt,
          status: order.status,
          amount: order.totalAmount
        });
      });
      
      // Get recent gigs created
      const recentGigs = await Gig.find({ sellerId: userId })
        .sort({ createdAt: -1 })
        .limit(5);
      
      recentGigs.forEach(gig => {
        activities.push({
          type: 'gig_created',
          title: `Created gig "${gig.title}"`,
          description: `In ${gig.category}`,
          date: gig.createdAt,
          price: gig.price
        });
      });
    }
    
    // Sort all activities by date
    activities.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    res.json({
      activities: activities.slice(0, 10) // Return latest 10 activities
    });
    
  } catch (error) {
    console.error('Get user activity error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};
