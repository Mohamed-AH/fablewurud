require('dotenv').config();
const connectDB = require('../config/database');
const { Sheikh, Series, Lecture } = require('../models');

const seedDatabase = async () => {
  try {
    console.log('🌱 Starting database seed...');

    // Connect to database
    await connectDB();

    // Clear existing data
    console.log('🗑️  Clearing existing data...');
    await Sheikh.deleteMany({});
    await Series.deleteMany({});
    await Lecture.deleteMany({});

    // Create test sheikhs
    console.log('👤 Creating sheikhs...');
    const sheikh1 = await Sheikh.create({
      nameArabic: 'حسن الدغريري',
      nameEnglish: 'Hassan Al-Daghriri',
      honorific: 'حفظه الله',
      bioArabic: 'من طلبة العلم المعاصرين، له جهود في نشر العلم الشرعي',
      bioEnglish: 'Contemporary Islamic scholar with efforts in spreading Islamic knowledge'
    });

    const sheikh2 = await Sheikh.create({
      nameArabic: 'محمد بن عبدالله',
      nameEnglish: 'Mohammed bin Abdullah',
      honorific: 'حفظه الله',
      bioArabic: 'طالب علم متخصص في الفقه والأصول',
      bioEnglish: 'Islamic scholar specialized in Fiqh and Usul'
    });

    console.log(`✅ Created ${2} sheikhs`);

    // Create test series
    console.log('📚 Creating series...');
    const series1 = await Series.create({
      titleArabic: 'شرح كتاب التوحيد',
      titleEnglish: 'Explanation of Kitab At-Tawheed',
      descriptionArabic: 'شرح كتاب التوحيد لشيخ الإسلام محمد بن عبد الوهاب رحمه الله',
      descriptionEnglish: 'Explanation of the Book of Tawheed by Sheikh Muhammad ibn Abdul Wahhab',
      sheikhId: sheikh1._id,
      category: 'Aqeedah',
      bookTitle: 'كتاب التوحيد',
      bookAuthor: 'محمد بن عبد الوهاب'
    });

    const series2 = await Series.create({
      titleArabic: 'شرح الأربعين النووية',
      titleEnglish: 'Explanation of 40 Hadith Nawawi',
      descriptionArabic: 'شرح الأحاديث الأربعين للإمام النووي رحمه الله',
      descriptionEnglish: 'Explanation of the 40 Hadith by Imam An-Nawawi',
      sheikhId: sheikh2._id,
      category: 'Hadith',
      bookTitle: 'الأربعين النووية',
      bookAuthor: 'الإمام النووي'
    });

    console.log(`✅ Created ${2} series`);

    // Create test lectures
    console.log('🎙️  Creating lectures...');

    const lecture1 = await Lecture.create({
      audioFileName: 'test-lecture-1.mp3',
      titleArabic: 'شرح كتاب التوحيد - الدرس الأول',
      titleEnglish: 'Explanation of Kitab At-Tawheed - Lesson 1',
      descriptionArabic: 'المقدمة وبيان أهمية التوحيد',
      descriptionEnglish: 'Introduction and importance of Tawheed',
      sheikhId: sheikh1._id,
      seriesId: series1._id,
      lectureNumber: 1,
      duration: 2700, // 45 minutes
      fileSize: 15728640, // ~15MB
      location: 'مسجد الورود، جدة',
      category: 'Aqeedah',
      dateRecorded: new Date('2024-01-15'),
      dateRecordedHijri: '4 رجب 1445',
      published: true,
      featured: true,
      playCount: 125,
      downloadCount: 45
    });

    const lecture2 = await Lecture.create({
      audioFileName: 'test-lecture-2.mp3',
      titleArabic: 'شرح كتاب التوحيد - الدرس الثاني',
      titleEnglish: 'Explanation of Kitab At-Tawheed - Lesson 2',
      descriptionArabic: 'فضل التوحيد وما يكفر من الذنوب',
      descriptionEnglish: 'The virtue of Tawheed and what it expiates of sins',
      sheikhId: sheikh1._id,
      seriesId: series1._id,
      lectureNumber: 2,
      duration: 3000, // 50 minutes
      fileSize: 17825792, // ~17MB
      location: 'مسجد الورود، جدة',
      category: 'Aqeedah',
      dateRecorded: new Date('2024-01-22'),
      dateRecordedHijri: '11 رجب 1445',
      published: true,
      featured: false,
      playCount: 98,
      downloadCount: 32
    });

    const lecture3 = await Lecture.create({
      audioFileName: 'test-lecture-3.mp3',
      titleArabic: 'الحديث الأول: إنما الأعمال بالنيات',
      titleEnglish: 'First Hadith: Actions are by intentions',
      descriptionArabic: 'شرح الحديث الأول من الأربعين النووية',
      descriptionEnglish: 'Explanation of the first hadith from 40 Hadith Nawawi',
      sheikhId: sheikh2._id,
      seriesId: series2._id,
      lectureNumber: 1,
      duration: 2400, // 40 minutes
      fileSize: 14155776, // ~13.5MB
      location: 'Online',
      category: 'Hadith',
      dateRecorded: new Date('2024-02-01'),
      dateRecordedHijri: '21 رجب 1445',
      published: true,
      featured: true,
      playCount: 210,
      downloadCount: 78
    });

    console.log(`✅ Created ${3} lectures`);

    // Update lecture counts
    await Sheikh.findByIdAndUpdate(sheikh1._id, { lectureCount: 2 });
    await Sheikh.findByIdAndUpdate(sheikh2._id, { lectureCount: 1 });
    await Series.findByIdAndUpdate(series1._id, { lectureCount: 2 });
    await Series.findByIdAndUpdate(series2._id, { lectureCount: 1 });

    console.log('✅ Updated lecture counts');

    // Test queries
    console.log('\n📊 Testing database queries...');

    const totalSheikhs = await Sheikh.countDocuments();
    const totalSeries = await Series.countDocuments();
    const totalLectures = await Lecture.countDocuments();
    const publishedLectures = await Lecture.countDocuments({ published: true });
    const featuredLectures = await Lecture.countDocuments({ featured: true });

    console.log(`  • Total Sheikhs: ${totalSheikhs}`);
    console.log(`  • Total Series: ${totalSeries}`);
    console.log(`  • Total Lectures: ${totalLectures}`);
    console.log(`  • Published Lectures: ${publishedLectures}`);
    console.log(`  • Featured Lectures: ${featuredLectures}`);

    // Test populate
    console.log('\n🔗 Testing population...');
    const lectureWithRefs = await Lecture.findById(lecture1._id)
      .populate('sheikhId')
      .populate('seriesId');

    console.log(`  • Lecture: ${lectureWithRefs.titleArabic}`);
    console.log(`  • Sheikh: ${lectureWithRefs.sheikhId.nameArabic}`);
    console.log(`  • Series: ${lectureWithRefs.seriesId.titleArabic}`);

    console.log('\n🎉 Database seed completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
};

// Run seed
seedDatabase();
