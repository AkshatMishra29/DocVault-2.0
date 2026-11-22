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
import { backfillDocVaultIds } from './modules/auth/docVaultId.util.js';
import { startSharingExpiryWorker } from './modules/sharing/expiryWorker.service.js';
import { prewarmGoogleOAuth } from './modules/auth/auth.service.js';

/* ==========================================================================
   Server Initialization (Optimized for Sub-50ms Port Binding on Cloud Platforms)
   ========================================================================== */
async function startServer() {
  try {
    // 1. Bind port immediately: satisfies Render health-check router instantly
    const server = app.listen(config.port, () => {
      console.log(`[DocVault Server] API live and listening on http://localhost:${config.port}`);
    });

    // 2. Pre-warm Google OAuth public certificates & TLS pool immediately
    prewarmGoogleOAuth();

    // 3. Connect to MongoDB Atlas (Mongoose automatically buffers queries while connecting)
    console.log('[MongoDB] Connecting to Atlas cluster...');
    mongoose.connect(config.mongoUri)
      .then(async () => {
        console.log('[MongoDB] Connected successfully to Atlas cluster!');

        // Run non-blocking initialization tasks in background
        startJobWorker();
        startSharingExpiryWorker();
        backfillDocVaultIds().catch((err) => console.warn('[DocVault ID Backfill Notice]:', err.message));
      })
      .catch((err) => {
        console.error('[MongoDB Error] Connection failed:', err.message);
      });

    // 4. Render Cloud Keep-Alive Heartbeat: Self-pings /api/health every 9 minutes
    // Prevents Render Free Tier from spinning down into 60-90s cold sleep
    const keepAliveUrl = process.env.RENDER_EXTERNAL_URL || 'https://docvault-backend-tiyz.onrender.com';
    setInterval(async () => {
      try {
        const res = await fetch(`${keepAliveUrl}/api/health`, {
          signal: AbortSignal.timeout(8000),
          headers: { 'User-Agent': 'DocVault-Internal-Heartbeat/2.0' },
        });
        if (res.ok) {
          console.log('[KeepAlive] Heartbeat ping successful — server maintained in warm state.');
        }
      } catch (err) {
        // Silently catch network or timeout blips
      }
    }, 9 * 60 * 1000); // 9 minutes interval (well before Render's 15-minute sleep threshold)

  } catch (err) {
    console.error('[Server Error] Failed to start:', err.message);
  }
}

startServer();
