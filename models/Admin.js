const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  googleId: {
    type: String,
    required: false,
    sparse: true,  // Only enforce uniqueness when value exists
    index: true
  },
  username: {
    type: String,
    required: false,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  displayName: {
    type: String,
    trim: true
  },
  firstName: {
    type: String,
    trim: true
  },
  lastName: {
    type: String,
    trim: true
  },
  profilePhoto: {
    type: String,
    trim: true
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  role: {
    type: String,
    enum: ['admin', 'editor', 'articleEditor'],
    default: 'editor',
    index: true
  }
}, {
  timestamps: true
});

// Method to update last login
adminSchema.methods.updateLastLogin = async function() {
  this.lastLogin = new Date();
  return this.save();
};

// Static method to check if email is whitelisted
adminSchema.statics.isEmailWhitelisted = function(email) {
  const whitelistedEmails = process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase())
    : [];

  return whitelistedEmails.includes(email.toLowerCase());
};

module.exports = mongoose.model('Admin', adminSchema);
