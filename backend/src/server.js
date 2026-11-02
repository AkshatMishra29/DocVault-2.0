import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // Ignore if custom dns servers cannot be set
}

import mongoose from 'mongoose';
import app from './app.js';
import { config } from './config/index.js';
import { initFirebaseAdmin } from './services/storage/firebaseService.js';
import { startJobWorker } from './modules/pipeline/jobQueue.service.js';

/* ==========================================================================
   Server Initialization
   ========================================================================== */
async function startServer() {
  try {
    console.log('[MongoDB] Connecting to cluster...');
    await mongoose.connect(config.mongoUri);
    console.log('[MongoDB] Connected successfully to Atlas cluster!');

    // Initialize Universal Pipeline Background Job Worker
    startJobWorker();

    app.listen(config.port, () => {
      console.log(`[DocVault Server] API running on http://localhost:${config.port}`);
    });
  } catch (err) {
    console.error('[Server Error] Failed to start:', err.message);
  }
}

startServer();
