require('dotenv').config();
const mongoose = require('mongoose');
const { Lecture } = require('../models');

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅ MongoDB Connected\n');

    const result = await Lecture.updateMany(
      { published: false },
      { $set: { published: true } }
    );

    console.log(`✅ Published ${result.modifiedCount} lectures`);

    const totalPublished = await Lecture.countDocuments({ published: true });
    console.log(`📊 Total published lectures: ${totalPublished}`);

    console.log('\n💡 Note: Lectures are published for testing.');
    console.log('   Audio files still need to be uploaded to /uploads folder');
    console.log('   and matched with audioFileName in database.\n');

    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
