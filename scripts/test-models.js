// Simple test to verify models are properly defined
const models = require('../models');

console.log('🧪 Testing Mongoose Models...\n');

console.log('📦 Available Models:');
console.log('  • Sheikh:', models.Sheikh ? '✅' : '❌');
console.log('  • Series:', models.Series ? '✅' : '❌');
console.log('  • Lecture:', models.Lecture ? '✅' : '❌');
console.log('  • Admin:', models.Admin ? '✅' : '❌');

console.log('\n📋 Schema Fields:');

if (models.Sheikh) {
  const sheikhFields = Object.keys(models.Sheikh.schema.paths);
  console.log(`  Sheikh has ${sheikhFields.length} fields:`, sheikhFields.slice(0, 5).join(', '), '...');
}

if (models.Series) {
  const seriesFields = Object.keys(models.Series.schema.paths);
  console.log(`  Series has ${seriesFields.length} fields:`, seriesFields.slice(0, 5).join(', '), '...');
}

if (models.Lecture) {
  const lectureFields = Object.keys(models.Lecture.schema.paths);
  console.log(`  Lecture has ${lectureFields.length} fields:`, lectureFields.slice(0, 5).join(', '), '...');
}

if (models.Admin) {
  const adminFields = Object.keys(models.Admin.schema.paths);
  console.log(`  Admin has ${adminFields.length} fields:`, adminFields.slice(0, 5).join(', '), '...');
}

console.log('\n🔍 Checking Indexes:');
console.log('  Sheikh indexes:', models.Sheikh.schema.indexes().length);
console.log('  Series indexes:', models.Series.schema.indexes().length);
console.log('  Lecture indexes:', models.Lecture.schema.indexes().length);
console.log('  Admin indexes:', models.Admin.schema.indexes().length);

console.log('\n✅ All models loaded successfully!');
console.log('💡 To test with real database, set up MongoDB Atlas and run: npm run db:seed');
