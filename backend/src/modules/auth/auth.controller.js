import * as authService from './auth.service.js';

export async function register(req, res) {
  try {
    const result = await authService.registerUser(req.body);
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function sendOtp(req, res) {
  try {
    const result = await authService.sendOtp(req.body);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function verifyOtp(req, res) {
  try {
    const result = await authService.verifyOtpCode(req.body);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function login(req, res) {
  try {
    const result = await authService.loginUser(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function verifyPin(req, res) {
  try {
    const result = await authService.verifyUserPin(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: err.message,
      lockUntil: err.lockUntil || null,
      remainingSeconds: err.remainingSeconds || null,
      attemptsLeft: err.attemptsLeft ?? null
    });
  }
}

export async function getMe(req, res) {
  try {
    const user = await authService.getCurrentUser(req.user.userId);
    res.json({ success: true, user });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function updateSessionSettings(req, res) {
  try {
    const result = await authService.updateSessionSettings(req.user.userId, req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function registerBiometrics(req, res) {
  try {
    const result = await authService.registerBiometricCredential(req.user.userId, req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function firebaseAuth(req, res) {
  try {
    const { idToken } = req.body;
    const result = await authService.authenticateWithFirebaseIdToken(idToken);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function resetPassword(req, res) {
  try {
    const result = await authService.resetPasswordWithOtp(req.body);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function loginWithOtp(req, res) {
  try {
    const result = await authService.loginWithOtp(req.body);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
}

export async function verifyBiometrics(req, res) {

  try {
    const result = await authService.verifyBiometricUnlock(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: err.message,
      lockUntil: err.lockUntil || null,
      remainingSeconds: err.remainingSeconds || null,
    });
  }
}

