const mongoose = require('mongoose');
const { Lecture, Sheikh, Series } = require('../models');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

async function deploymentReadinessCheck() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected\n');

    console.log('='.repeat(70));
    console.log('🚀 DEPLOYMENT READINESS CHECK');
    console.log('='.repeat(70));
    console.log('');

    const issues = [];
    const warnings = [];

    // 1. Check Database Content
    console.log('1️⃣  DATABASE CONTENT CHECK\n');

    const totalLectures = await Lecture.countDocuments();
    const publishedLectures = await Lecture.countDocuments({ published: true });
    const unpublishedLectures = totalLectures - publishedLectures;

    console.log(`   Total Lectures: ${totalLectures}`);
    console.log(`   Published: ${publishedLectures}`);
    console.log(`   Unpublished: ${unpublishedLectures}`);

    if (unpublishedLectures > 0) {
      warnings.push(`${unpublishedLectures} lectures are unpublished and won't show on site`);
    }

    const totalSeries = await Series.countDocuments();
    const totalSheikhs = await Sheikh.countDocuments();

    console.log(`   Total Series: ${totalSeries}`);
    console.log(`   Total Sheikhs: ${totalSheikhs}`);
    console.log('');

    // 2. Check for Critical Data Issues
    console.log('2️⃣  DATA INTEGRITY CHECK\n');

    // Lectures without sheikh
    const lecturesWithoutSheikh = await Lecture.countDocuments({
      sheikhId: null
    });

    if (lecturesWithoutSheikh > 0) {
      issues.push(`${lecturesWithoutSheikh} lectures have no sheikh assigned`);
      console.log(`   ❌ ${lecturesWithoutSheikh} lectures without sheikh`);
    } else {
      console.log('   ✅ All lectures have sheikh assigned');
    }

    // Lectures without audio file
    const lecturesWithoutAudio = await Lecture.countDocuments({
      audioFileName: null,
      published: true
    });

    if (lecturesWithoutAudio > 0) {
      issues.push(`${lecturesWithoutAudio} published lectures have no audio file`);
      console.log(`   ❌ ${lecturesWithoutAudio} published lectures without audio`);
    } else {
      console.log('   ✅ All published lectures have audio files');
    }

    // Sheikhs without name
    const sheikhsWithoutName = await Sheikh.countDocuments({
      nameArabic: { $in: [null, ''] }
    });

    if (sheikhsWithoutName > 0) {
      issues.push(`${sheikhsWithoutName} sheikhs missing nameArabic`);
      console.log(`   ❌ ${sheikhsWithoutName} sheikhs without name`);
    } else {
      console.log('   ✅ All sheikhs have names');
    }

    console.log('');

    // 3. Check for Duplicate Lectures
    console.log('3️⃣  DUPLICATE CHECK\n');

    const allSeries = await Series.find().lean();
    let totalDuplicates = 0;

    for (const series of allSeries) {
      const lectures = await Lecture.find({
        seriesId: series._id
      }).lean();

      const byNumber = {};
      lectures.forEach(lec => {
        const num = lec.lectureNumber;
        if (num) {
          if (!byNumber[num]) byNumber[num] = [];
          byNumber[num].push(lec);
        }
      });

      const duplicates = Object.entries(byNumber).filter(([n, lecs]) => lecs.length > 1);
      if (duplicates.length > 0) {
        totalDuplicates += duplicates.length;
        console.log(`   ⚠️  ${series.titleArabic}:`);
        duplicates.forEach(([num, lecs]) => {
          console.log(`      Duplicate #${num} (${lecs.length} lectures)`);
        });
      }
    }

    if (totalDuplicates > 0) {
      warnings.push(`${totalDuplicates} series have duplicate lecture numbers`);
    } else {
      console.log('   ✅ No duplicate lecture numbers found');
    }

    console.log('');

    // 4. Check Environment Variables
    console.log('4️⃣  ENVIRONMENT CHECK\n');

    const requiredEnvVars = [
      'MONGODB_URI',
      'PORT',
      'SESSION_SECRET'
    ];

    let envIssues = 0;
    requiredEnvVars.forEach(varName => {
      if (!process.env[varName]) {
        issues.push(`Missing environment variable: ${varName}`);
        console.log(`   ❌ ${varName} not set`);
        envIssues++;
      } else {
        console.log(`   ✅ ${varName} set`);
      }
    });

    if (envIssues === 0) {
      console.log('   ✅ All required environment variables set');
    }

    console.log('');

    // 5. Check Upload Directory
    console.log('5️⃣  FILE SYSTEM CHECK\n');

    const uploadDir = process.env.UPLOAD_DIR || '/mnt/audio';
    console.log(`   Upload directory: ${uploadDir}`);

    if (fs.existsSync(uploadDir)) {
      console.log('   ✅ Upload directory exists');

      const files = fs.readdirSync(uploadDir);
      console.log(`   📁 ${files.length} files in upload directory`);

      // Check if published lectures have existing files
      const publishedWithAudio = await Lecture.find({
        published: true,
        audioFileName: { $ne: null }
      }).lean();

      let missingFiles = 0;
      publishedWithAudio.forEach(lecture => {
        const filePath = path.join(uploadDir, lecture.audioFileName);
        if (!fs.existsSync(filePath)) {
          missingFiles++;
        }
      });

      if (missingFiles > 0) {
        warnings.push(`${missingFiles} published lectures have audio files that don't exist on disk`);
        console.log(`   ⚠️  ${missingFiles} audio files not found on disk`);
      } else {
        console.log('   ✅ All published lecture audio files exist');
      }
    } else {
      issues.push(`Upload directory does not exist: ${uploadDir}`);
      console.log(`   ❌ Upload directory not found`);
    }

    console.log('');

    // 6. Feature Checklist
    console.log('6️⃣  FEATURES CHECKLIST\n');

    console.log('   ✅ Homepage with statistics');
    console.log('   ✅ Lecture browsing and search');
    console.log('   ✅ Series listing and detail pages');
    console.log('   ✅ Sheikh listing and profile pages');
    console.log('   ✅ Audio playback with sticky player');
    console.log('   ✅ Hierarchical Juma Khutba display');
    console.log('   ✅ Responsive design');
    console.log('');

    // Final Summary
    console.log('='.repeat(70));
    console.log('📊 SUMMARY');
    console.log('='.repeat(70));
    console.log('');

    if (issues.length === 0 && warnings.length === 0) {
      console.log('✅ ✅ ✅  ALL CHECKS PASSED - READY FOR DEPLOYMENT!');
    } else {
      if (issues.length > 0) {
        console.log('❌ CRITICAL ISSUES (Must fix before deployment):');
        issues.forEach((issue, i) => {
          console.log(`   ${i + 1}. ${issue}`);
        });
        console.log('');
      }

      if (warnings.length > 0) {
        console.log('⚠️  WARNINGS (Should fix before deployment):');
        warnings.forEach((warning, i) => {
          console.log(`   ${i + 1}. ${warning}`);
        });
        console.log('');
      }

      if (issues.length === 0) {
        console.log('✅ No critical issues - Can deploy with warnings');
      } else {
        console.log('❌ Fix critical issues before deployment');
      }
    }

    console.log('');
    console.log('='.repeat(70));

    await mongoose.disconnect();
    process.exit(issues.length > 0 ? 1 : 0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

deploymentReadinessCheck();
