const mongoose = require('mongoose');

/**
 * Global Lean Middleware Plugin
 * Defaults all find/findOne queries to .lean() for memory efficiency.
 * To override in routes that need Mongoose documents, use { lean: false }
 * or use findOneAndUpdate() which is unaffected.
 */
mongoose.plugin((schema) => {
  schema.pre('find', function() {
    if (this.options.lean === undefined) {
      this.lean();
    }
  });
  schema.pre('findOne', function() {
    if (this.options.lean === undefined) {
      this.lean();
    }
  });
});

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000, // Fail fast: 10 second timeout for initial connection
      socketTimeoutMS: 45000,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed through app termination');
      process.exit(0);
    });

    return conn;
  } catch (error) {
    // Log error but don't exit - let maintenance mode handle it
    console.error('❌ MongoDB connection failed:', error.message);
    console.warn('⚠️ Server will run in maintenance mode until database is available');
    return null;
  }
};

module.exports = connectDB;
