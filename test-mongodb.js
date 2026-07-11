require('dotenv').config();
const mongoose = require('mongoose');

console.log('🔍 Testing MongoDB connection...');
console.log('📍 Connection string:', process.env.MONGODB_URI.replace(/:[^:]*@/, ':****@'));

mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000
})
.then(() => {
  console.log('✅ MongoDB connection successful!');
  console.log('📊 Database:', mongoose.connection.name);
  process.exit(0);
})
.catch((error) => {
  console.error('❌ MongoDB connection failed:');
  console.error('Error:', error.message);
  console.error('\n💡 Troubleshooting:');
  console.error('1. Check if your IP is whitelisted in MongoDB Atlas');
  console.error('2. Verify the connection string is correct');
  console.error('3. Ensure the database user credentials are correct');
  process.exit(1);
});
