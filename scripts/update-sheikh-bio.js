const mongoose = require('mongoose');
const { Sheikh } = require('../models');
require('dotenv').config();

async function updateSheikhBio() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find sheikh by name (searching for Hassan Al-Daghriri)
    const sheikh = await Sheikh.findOne({
      $or: [
        { nameArabic: /حسن.*الدغيري/ },
        { nameEnglish: /Hassan.*Daghriri/i }
      ]
    });

    if (!sheikh) {
      console.log('❌ Sheikh not found. Searching all sheikhs...');
      const allSheikhs = await Sheikh.find({}).select('nameArabic nameEnglish');
      console.log('Available sheikhs:');
      allSheikhs.forEach(s => {
        console.log(`- ${s.nameArabic} (${s.nameEnglish || 'N/A'})`);
      });
      process.exit(1);
    }

    console.log(`✅ Found sheikh: ${sheikh.nameArabic}`);

    // Update biography
    const bioEnglish = "Sheikh Hassan Al-Daghriri studied under the renowned Sheikh Ahmed bin Yahya al-Najmi (may Allah have mercy on him), having spent years archiving his audio lessons and preparing his manuscripts for publication. With over 30 years dedicated to da'wah, he currently teaches at Jami' Al-Wurood in the Al-Wurood district of Jeddah.";

    const bioArabic = "الشيخ حسن الدغيري درس تحت إشراف الشيخ الجليل أحمد بن يحيى النجمي (رحمه الله)، حيث قضى سنوات في أرشفة دروسه الصوتية وإعداد مخطوطاته للنشر. بخبرة تزيد عن ٣٠ عاماً مكرسة للدعوة، يدرّس حالياً في جامع الورود بحي الورود في جدة.";

    sheikh.bioEnglish = bioEnglish;
    sheikh.bioArabic = bioArabic;

    await sheikh.save();

    console.log('✅ Biography updated successfully!');
    console.log('\nUpdated sheikh:');
    console.log('Name:', sheikh.nameArabic);
    console.log('Bio (English):', bioEnglish.substring(0, 100) + '...');
    console.log('Bio (Arabic):', bioArabic.substring(0, 100) + '...');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateSheikhBio();
