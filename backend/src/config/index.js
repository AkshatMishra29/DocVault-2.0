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
    model: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
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
  googleAuth: {
    clientId: process.env.GOOGLE_CLIENT_ID || '940417312093-vftovh8cf0r3q5jr45jt1659bgnh7n1e.apps.googleusercontent.com',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
  pipeline: {
    version: process.env.PIPELINE_VERSION || '1.0.0',
    noticeVersion: process.env.NOTICE_VERSION || '1.0.0',
    defaultAiPolicy: process.env.AI_POLICY_DEFAULT || 'storage_only',
    geminiDailyCap: parseInt(process.env.GEMINI_DAILY_CAP || '15', 10),
    groqDailyTokenCap: parseInt(process.env.GROQ_DAILY_TOKEN_CAP || '100000', 10),
    userDailyTokenCap: parseInt(process.env.USER_DAILY_TOKEN_CAP || '25000', 10),
    leaseTimeoutMs: parseInt(process.env.JOB_LEASE_TIMEOUT_MS || '60000', 10),
    maxConcurrency: parseInt(process.env.JOB_MAX_CONCURRENCY || '2', 10),
    maxPages: parseInt(process.env.JOB_PAGE_CAP || '25', 10),
    perPageTimeoutMs: parseInt(process.env.PAGE_TIMEOUT_MS || '15000', 10),
    memoryGuardBytes: parseInt(process.env.JOB_MEMORY_GUARD_BYTES || `${450 * 1024 * 1024}`, 10),
  },
};
