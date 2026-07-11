const mongoose = require('mongoose');

// Create a separate connection for the search database
let searchConnection = null;

const connectSearchDB = async () => {
  const searchUri = process.env.SEARCH_MONGODB_URI;

  if (!searchUri) {
    console.warn('⚠️  SEARCH_MONGODB_URI not set - search features disabled');
    return null;
  }

  try {
    searchConnection = await mongoose.createConnection(searchUri).asPromise();

    console.log(`✅ Search MongoDB Connected: ${searchConnection.host}`);
    console.log(`📊 Search Database: ${searchConnection.name}`);
    console.log(`📝 Search logs will be saved to: ${searchConnection.name}.searchlogs`);

    searchConnection.on('error', (err) => {
      console.error('❌ Search MongoDB connection error:', err);
    });

    searchConnection.on('disconnected', () => {
      console.warn('⚠️  Search MongoDB disconnected');
    });

    return searchConnection;
  } catch (error) {
    console.error('❌ Search MongoDB connection failed:', error.message);
    return null;
  }
};

const getSearchConnection = () => searchConnection;

module.exports = { connectSearchDB, getSearchConnection };
