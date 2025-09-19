const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['bank', 'paypal'],
    required: true
  },
  // Bank transfer fields
  accountName: {
    type: String,
    required: function() { return this.type === 'bank'; }
  },
  accountNumber: {
    type: String,
    required: function() { return this.type === 'bank'; }
  },
  routingNumber: {
    type: String,
    required: function() { return this.type === 'bank'; }
  },
  bankName: {
    type: String,
    required: function() { return this.type === 'bank'; }
  },
  // PayPal fields
  email: {
    type: String,
    required: function() { return this.type === 'paypal'; },
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address']
  },
  isPrimary: {
    type: Boolean,
    default: false
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending_verification'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Ensure only one primary payment method per user
paymentMethodSchema.pre('save', async function(next) {
  if (this.isPrimary && this.isModified('isPrimary')) {
    await this.constructor.updateMany(
      { userId: this.userId, _id: { $ne: this._id } },
      { isPrimary: false }
    );
  }
  next();
});

module.exports = mongoose.model('PaymentMethod', paymentMethodSchema);
