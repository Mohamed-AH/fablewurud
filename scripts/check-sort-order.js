require('dotenv').config();
const mongoose = require('mongoose');

async function checkSortOrder() {
  await mongoose.connect(process.env.MONGODB_URI);

  const Lecture = require('../models/Lecture');
  const Series = require('../models/Series');

  // Find the series "الأفنان الندية - عن بعد"
  const series = await Series.findOne({ titleArabic: /الأفنان الندية.*عن بعد/ });

  if (!series) {
    console.log('Series not found');
    process.exit(1);
  }

  console.log('Series:', series.titleArabic, '- ID:', series._id);
  console.log('\nLectures with sortOrder values:\n');

  const lectures = await Lecture.find({ seriesId: series._id })
    .sort({ sortOrder: 1, lectureNumber: 1 })
    .select('titleArabic lectureNumber sortOrder')
    .lean();

  lectures.forEach((l, i) => {
    const so = l.sortOrder !== null && l.sortOrder !== undefined ? l.sortOrder : 'NULL';
    console.log((i+1) + '. sortOrder=' + so + ' | lectureNum=' + l.lectureNumber + ' | ' + l.titleArabic);
  });

  console.log('\n--- Stats ---');
  const withSortOrder = lectures.filter(l => l.sortOrder != null).length;
  const withoutSortOrder = lectures.filter(l => l.sortOrder == null).length;
  console.log('With sortOrder: ' + withSortOrder);
  console.log('Without sortOrder (null/undefined): ' + withoutSortOrder);

  await mongoose.disconnect();
}

checkSortOrder().catch(console.error);
