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
      // Cap the pool: mongoose defaults to 100 sockets/connection, and we run two
      // connections (main + search). On a small instance (e.g. 512MB) that's a large,
      // avoidable memory footprint. Override with DB_MAX_POOL if a bigger box is used.
      maxPoolSize: parseInt(process.env.DB_MAX_POOL, 10) || 8,
      monitorCommands: true, // Emit command events for DB latency metrics (Grafana)
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);

    // Wire MongoDB command latency into metrics (no-op if metrics disabled)
    try {
      require('../utils/metrics').attachDbMonitoring(conn.connection);
    } catch (e) {
      console.warn('Could not attach DB monitoring:', e.message);
    }

    // Detect transaction support (replica set / mongos) for atomic multi-doc writes
    try {
      const support = await require('../utils/dbTransaction').detectTransactionSupport();
      console.log(`🔐 Transactions ${support ? 'supported' : 'unsupported (standalone) — using sequential writes'}`);
    } catch (e) {
      console.warn('Could not detect transaction support:', e.message);
    }

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
