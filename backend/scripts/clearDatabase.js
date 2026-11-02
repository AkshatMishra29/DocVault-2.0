import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // Ignore if custom dns servers cannot be set
}

import mongoose from 'mongoose';
import { config } from '../src/config/index.js';

async function clearDatabase() {
  console.log('====================================================');
  console.log('       DOCVAULT DATABASE PURGE / RESET UTILITY      ');
  console.log('====================================================');

  try {
    console.log('[MongoDB] Connecting to cluster...');
    await mongoose.connect(config.mongoUri);
    console.log(`[MongoDB] Connected to database: "${mongoose.connection.name}"`);

    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`[MongoDB] Found ${collections.length} collections.`);

    let totalDeleted = 0;

    for (const col of collections) {
      const collectionName = col.name;
      // Skip system collections if any
      if (collectionName.startsWith('system.')) continue;

      const collection = mongoose.connection.db.collection(collectionName);
      const countBefore = await collection.countDocuments();
      const result = await collection.deleteMany({});
      
      console.log(`  - Cleared "${collectionName}": ${result.deletedCount} documents removed (was ${countBefore})`);
      totalDeleted += result.deletedCount;
    }

    console.log('----------------------------------------------------');
    console.log(`[Summary] Successfully purged ${totalDeleted} documents across all collections.`);

    // Verify all collections are now empty
    console.log('[Verification] Checking all collection counts...');
    let allEmpty = true;
    for (const col of collections) {
      if (col.name.startsWith('system.')) continue;
      const count = await mongoose.connection.db.collection(col.name).countDocuments();
      if (count !== 0) {
        console.warn(`  ! Warning: Collection "${col.name}" still has ${count} documents.`);
        allEmpty = false;
      }
    }

    if (allEmpty) {
      console.log('[Verification] Confirmed: Database is 100% clean and empty.');
    } else {
      console.warn('[Verification] Some collections still contain documents.');
    }

    console.log('====================================================');
  } catch (err) {
    console.error('[Error] Failed to clear database:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('[MongoDB] Connection closed.');
  }
}

clearDatabase();
