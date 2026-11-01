import express from 'express';
import cors from 'cors';
import { authenticateToken } from './middleware/auth.middleware.js';

// Modular routes
import authRoutes from './modules/auth/auth.routes.js';
import documentRoutes from './modules/documents/document.routes.js';
import assetRoutes from './modules/assets/asset.routes.js';
import deadlineRoutes from './modules/deadlines/deadline.routes.js';
import aiRoutes from './modules/ai/ai.routes.js';
import vaultRoutes from './modules/vault/vault.routes.js';
import extractionRoutes from './modules/extraction/extraction.routes.js';

import mongoose from 'mongoose';
import { config } from './config/index.js';

const app = express();

// Security & CORS Whitelist
const allowedOrigins = [
  'https://docvault-new-1.onrender.com',
  'https://docvault-new.onrender.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5001'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
}));

app.use(express.json());
app.use(authenticateToken);

/* ==========================================================================
   Health & Service Verification API
   ========================================================================== */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    services: {
      mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Connecting/Disconnected',
      groqApi: Boolean(config.groq.apiKey),
      huggingFaceApi: Boolean(config.huggingFace.apiKey),
      storage: 'MongoDB Internal Binary Storage (Database-backed)',
    },
    timestamp: new Date().toISOString(),
  });
});

/* ==========================================================================
   Modular Route Mounts
   ========================================================================== */
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/deadlines', deadlineRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/vault', vaultRoutes);
app.use('/api/extraction', extractionRoutes);

export default app;

