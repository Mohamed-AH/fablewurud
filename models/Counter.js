const mongoose = require('mongoose');

/**
 * Counter model for auto-incrementing shortIds
 *
 * CRITICAL: Always use findOneAndUpdate with $inc for atomic operations
 * to prevent race conditions during simultaneous document creation.
 */
const counterSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  seq: {
    type: Number,
    default: 0
  }
});

/**
 * Get next sequence value atomically
 * @param {string} name - Counter name (e.g., 'lecture', 'series', 'sheikh')
 * @returns {Promise<number>} - Next sequence number
 */
counterSchema.statics.getNextSequence = async function(name) {
  const counter = await this.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
