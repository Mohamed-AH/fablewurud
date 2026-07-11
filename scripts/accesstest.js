#!/usr/bin/env node
/**
 * Access Test - Verify MongoDB and OCI connectivity (Standalone)
 * Fetches first 5 records from each to confirm access
 *
 * Usage: node scripts/accesstest.js [--env .env.production]
 */

const argsForEnv = process.argv.slice(2);
const envIndex = argsForEnv.indexOf('--env');
const envPath = envIndex !== -1 ? argsForEnv[envIndex + 1] : '.env';

require('dotenv').config({ path: envPath });

const mongoose = require('mongoose');
const common = require('oci-common');
const os = require('oci-objectstorage');

async function testAccess() {
  console.log('\n🔍 Access Test\n');

  // Test MongoDB
  console.log('═══════════════════════════════════');
  console.log('📊 MongoDB Test');
  console.log('═══════════════════════════════════');

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const lectureSchema = new mongoose.Schema({
      audioFileName: String,
      titleArabic: String
    }, { collection: 'lectures', strict: false });

    const Lecture = mongoose.model('Lecture', lectureSchema);

    const lectures = await Lecture.find(
      { audioFileName: { $exists: true, $ne: null } },
      'audioFileName titleArabic'
    ).limit(5).lean();

    console.log(`Found ${lectures.length} records:\n`);
    lectures.forEach((l, i) => {
      console.log(`  ${i + 1}. ${l.audioFileName}`);
      if (l.titleArabic) console.log(`     Title: ${l.titleArabic}`);
    });

    await mongoose.disconnect();
    console.log('\n✅ MongoDB: OK\n');
  } catch (error) {
    console.error('❌ MongoDB Error:', error.message, '\n');
  }

  // Test OCI
  console.log('═══════════════════════════════════');
  console.log('☁️  OCI Object Storage Test');
  console.log('═══════════════════════════════════');

  try {
    let provider;

    if (process.env.OCI_PRIVATE_KEY && process.env.OCI_TENANCY) {
      const privateKey = process.env.OCI_PRIVATE_KEY.replace(/\\n/g, '\n');
      provider = new common.SimpleAuthenticationDetailsProvider(
        process.env.OCI_TENANCY,
        process.env.OCI_USER,
        process.env.OCI_FINGERPRINT,
        privateKey,
        null,
        common.Region.fromRegionId(process.env.OCI_REGION || 'us-ashburn-1')
      );
    } else if (process.env.OCI_CONFIG_FILE) {
      provider = new common.ConfigFileAuthenticationDetailsProvider(
        process.env.OCI_CONFIG_FILE,
        process.env.OCI_PROFILE || 'DEFAULT'
      );
    } else {
      console.log('❌ OCI credentials not configured\n');
      return;
    }

    const client = new os.ObjectStorageClient({ authenticationDetailsProvider: provider });
    const namespace = process.env.OCI_NAMESPACE;
    const bucketName = process.env.OCI_BUCKET || 'wurud-audio';
    const region = process.env.OCI_REGION || 'us-ashburn-1';

    console.log(`Namespace: ${namespace}`);
    console.log(`Bucket: ${bucketName}`);
    console.log(`Region: ${region}\n`);

    const response = await client.listObjects({
      namespaceName: namespace,
      bucketName: bucketName,
      limit: 5
    });

    const objects = response.listObjects.objects || [];
    console.log(`Found ${objects.length} objects:\n`);

    objects.forEach((obj, i) => {
      const sizeKB = obj.size ? (obj.size / 1024).toFixed(1) + ' KB' : '0 KB';
      console.log(`  ${i + 1}. ${obj.name}`);
      console.log(`     Size: ${sizeKB}`);
    });

    console.log('\n✅ OCI: OK\n');
  } catch (error) {
    console.error('❌ OCI Error:', error.message, '\n');
  }

  console.log('═══════════════════════════════════');
  console.log('Done!');
  console.log('═══════════════════════════════════\n');
}

testAccess().catch(console.error);
