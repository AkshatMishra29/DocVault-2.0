import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let bucket = null;
let firebaseApp = null;

export function initFirebaseAdmin() {
  if (getApps().length > 0) {
    firebaseApp = getApp();
    if (!bucket) {
      try {
        bucket = getStorage().bucket();
      } catch (e) {}
    }
    return firebaseApp;
  }

  try {
    let serviceAccount = null;

    if (config.firebase.serviceAccountJson) {
      serviceAccount = JSON.parse(config.firebase.serviceAccountJson);
    } else {
      // Resolve path against both cwd and backend directory
      const candidates = [
        config.firebase.serviceAccountPath,
        path.resolve(process.cwd(), config.firebase.serviceAccountPath),
        path.resolve(__dirname, '../../../firebase-service-account.json'),
        path.resolve(__dirname, '../../firebase-service-account.json'),
      ];

      for (const p of candidates) {
        if (p && fs.existsSync(p)) {
          serviceAccount = JSON.parse(fs.readFileSync(p, 'utf8'));
          break;
        }
      }
    }

    if (serviceAccount) {
      firebaseApp = initializeApp({
        credential: cert(serviceAccount),
        storageBucket: config.firebase.storageBucket,
      });
      bucket = getStorage().bucket();
      console.log(`[Firebase Admin] Initialized for project: ${serviceAccount.project_id || config.firebase.storageBucket}`);
    } else {
      console.warn('[Firebase Admin] Warning: No service account credentials found. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON.');
    }
  } catch (error) {
    console.error('[Firebase Admin] Initialization error:', error.message);
  }

  return firebaseApp;
}

// Auto-run initialization immediately on module load
initFirebaseAdmin();

/**
 * Upload a file buffer to Firebase Storage
 */
export async function uploadToFirebase(fileBuffer, destinationPath, mimetype) {
  if (!bucket) {
    throw new Error('Firebase Storage bucket is not initialized.');
  }

  const file = bucket.file(destinationPath);

  await file.save(fileBuffer, {
    metadata: {
      contentType: mimetype,
    },
    resumable: false,
  });

  // Generate a signed download URL valid for 30 days
  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 30 * 24 * 60 * 60 * 1000,
  });

  return {
    storagePath: destinationPath,
    downloadUrl: signedUrl,
  };
}

/**
 * Delete a file from Firebase Storage
 */
export async function deleteFromFirebase(destinationPath) {
  if (!bucket) return;
  try {
    const file = bucket.file(destinationPath);
    await file.delete();
  } catch (err) {
    console.warn(`[Firebase] Could not delete ${destinationPath}:`, err.message);
  }
}

export { bucket };
