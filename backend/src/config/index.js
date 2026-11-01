import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: process.env.PORT || 5001,
  mongoUri: process.env.MONGODB_URI,
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
  },
  huggingFace: {
    apiKey: process.env.HUGGINGFACE_API_KEY,
    model: process.env.HF_EMBEDDING_MODEL || 'BAAI/bge-small-en-v1.5',
    apiUrl: 'https://api-inference.huggingface.co/pipeline/feature-extraction/BAAI/bge-small-en-v1.5',
  },
  firebase: {
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.resolve(__dirname, '../firebase-service-account.json'),
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || null,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'docvault-app-f867f.firebasestorage.app',
  },
  jwtSecret: process.env.JWT_SECRET || 'docvault_fallback_secret',
};
