const mongoose = require('mongoose');
const { Sheikh } = require('../models');
require('dotenv').config();

async function updateSheikhBio() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // The biography texts
    const bioEnglish = "Sheikh Hassan Al-Daghriri studied under the renowned Sheikh Ahmed bin Yahya al-Najmi (may Allah have mercy on him), having spent years archiving his audio lessons and preparing his manuscripts for publication. With over 30 years dedicated to da'wah, he currently teaches at Jami' Al-Wurood in the Al-Wurood district of Jeddah.";

    const bioArabic = "الشيخ حسن الدغيري درس تحت إشراف الشيخ الجليل أحمد بن يحيى النجمي (رحمه الله)، حيث قضى سنوات في أرشفة دروسه الصوتية وإعداد مخطوطاته للنشر. بخبرة تزيد عن ٣٠ عاماً مكرسة للدعوة، يدرّس حالياً في جامع الورود بحي الورود في جدة.";

    // List all sheikhs first
    console.log('📋 Finding all sheikhs...\n');
    const allSheikhs = await Sheikh.find({}).select('_id nameArabic nameEnglish');

    console.log(`Found ${allSheikhs.length} sheikh(s):\n`);
    allSheikhs.forEach((s, index) => {
      console.log(`${index + 1}. ${s.nameArabic} (${s.nameEnglish || 'N/A'})`);
      console.log(`   ID: ${s._id}\n`);
    });

    // Find sheikh by name pattern (flexible matching)
    const sheikh = await Sheikh.findOne({
      $or: [
        { nameArabic: /حسن.*دغريري/i },
        { nameArabic: /الدغريري/i },
        { nameEnglish: /hassan/i },
        { nameEnglish: /daghriri/i }
      ]
    });

    if (!sheikh) {
      console.log('❌ Sheikh not found with pattern matching.');
      console.log('\nℹ️  Please update the sheikh manually using one of the IDs above.');
      console.log('   Or update the search pattern in the script.\n');
      process.exit(1);
    }

    console.log('✅ Found sheikh:');
    console.log(`   Name (Arabic): ${sheikh.nameArabic}`);
    console.log(`   Name (English): ${sheikh.nameEnglish || 'N/A'}`);
    console.log(`   ID: ${sheikh._id}\n`);

    // Update biography
    console.log('📝 Updating biography...\n');
    sheikh.bioEnglish = bioEnglish;
    sheikh.bioArabic = bioArabic;
    await sheikh.save();

    console.log('✅ Biography updated successfully!\n');
    console.log('='.repeat(80));
    console.log('Bio (English):');
    console.log(bioEnglish);
    console.log('\n' + '='.repeat(80));
    console.log('Bio (Arabic):');
    console.log(bioArabic);
    console.log('='.repeat(80));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateSheikhBio();
