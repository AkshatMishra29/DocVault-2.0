import { Router } from 'express';
import * as authController from './auth.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';

const router = Router();

router.post('/send-otp', authController.sendOtp);
router.post('/verify-otp', authController.verifyOtp);
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/login-otp', authController.loginWithOtp);
router.post('/reset-password', authController.resetPassword);
router.post('/reset-pin', authController.resetPin);
router.post('/change-pin', requireAuth, authController.changePin);
router.post('/change-password', requireAuth, authController.changePassword);
router.post('/firebase', authController.firebaseAuth);
router.post('/verify-pin', authController.verifyPin);
router.get('/me', requireAuth, authController.getMe);
router.post('/biometrics/verify', authController.verifyBiometrics);
router.post('/biometrics/register', requireAuth, authController.registerBiometrics);
router.patch('/session-settings', requireAuth, authController.updateSessionSettings);

export default router;

