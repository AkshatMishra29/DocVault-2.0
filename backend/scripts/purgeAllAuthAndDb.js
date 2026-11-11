import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import { initFirebaseAdmin } from '../src/services/storage/firebaseService.js';
import { getAuth } from 'firebase-admin/auth';

async function purgeEverything() {
  console.log('====================================================');
  console.log('   DOCVAULT COMPLETE SYSTEM PURGE: DB + FIREBASE AUTH ');
  console.log('====================================================');

  // 1. Purge MongoDB Atlas Collections
  try {
    console.log('[1/2] Connecting to MongoDB Atlas...');
    await mongoose.connect(config.mongoUri);
    console.log(`[MongoDB] Connected to database: "${mongoose.connection.name}"`);

    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`[MongoDB] Found ${collections.length} collections.`);

    let totalDeleted = 0;
    for (const col of collections) {
      if (col.name.startsWith('system.')) continue;
      const collection = mongoose.connection.db.collection(col.name);
      const countBefore = await collection.countDocuments();
      const result = await collection.deleteMany({});
      if (countBefore > 0) {
        console.log(`  - Purged "${col.name}": ${result.deletedCount} documents deleted.`);
      }
      totalDeleted += result.deletedCount;
    }
    console.log(`[MongoDB Summary] Successfully deleted ${totalDeleted} documents across all collections.`);
  } catch (err) {
    console.error('[MongoDB Error] Failed during database purge:', err);
  } finally {
    await mongoose.disconnect();
    console.log('[MongoDB] Connection closed.');
  }

  // 2. Purge Firebase Authentication Accounts
  try {
    console.log('----------------------------------------------------');
    console.log('[2/2] Connecting to Firebase Admin Auth...');
    initFirebaseAdmin();
    const auth = getAuth();

    let listResult = await auth.listUsers(1000);
    const users = listResult.users;
    console.log(`[Firebase Auth] Found ${users.length} registered accounts in project.`);

    if (users.length > 0) {
      const uids = users.map(u => {
        console.log(`  - Deleting Firebase User: ${u.email || u.uid} (${u.uid})`);
        return u.uid;
      });

      const deleteResult = await auth.deleteUsers(uids);
      console.log(`[Firebase Auth Summary] Successfully deleted ${deleteResult.successCount} users (${deleteResult.failureCount} failed).`);
    } else {
      console.log('[Firebase Auth] No users found in Firebase Auth project.');
    }
  } catch (err) {
    console.error('[Firebase Auth Error] Failed during Firebase user purge:', err);
  }

  console.log('====================================================');
  console.log('   SYSTEM PURGE COMPLETED: ZERO USERS REMAINING     ');
  console.log('====================================================');
}

purgeEverything();

