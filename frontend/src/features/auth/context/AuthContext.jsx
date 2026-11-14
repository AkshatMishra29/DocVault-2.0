import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiRequest } from '../../../services/api';

const AuthContext = createContext(null);
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes at rest

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('docvault_user');
      return saved ? JSON.parse(saved) : null;
    } catch (err) {
      console.warn('[DocVault Auth] Corrupted user data in localStorage, resetting:', err);
      localStorage.removeItem('docvault_user');
      return null;
    }
  });

  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem('docvault_token') || localStorage.getItem('token') || null;
    } catch {
      return null;
    }
  });

  // Track if vault PIN is currently unlocked for this active session
  const [isVaultUnlocked, setIsVaultUnlocked] = useState(() => {
    try {
      return sessionStorage.getItem('docvault_unlocked') === 'true';
    } catch {
      return false;
    }
  });

  const [pendingEmail, setPendingEmail] = useState(() => {
    try {
      return sessionStorage.getItem('docvault_pending_email') || '';
    } catch {
      return '';
    }
  });

  const [pinLength, setPinLength] = useState(() => {
    try {
      const len = parseInt(sessionStorage.getItem('docvault_pin_length') || '4', 10);
      return isNaN(len) ? 4 : len;
    } catch {
      return 4;
    }
  });

  // Track all remembered / saved sessions on this browser
  const [savedSessions, setSavedSessions] = useState(() => {
    try {
      const raw = localStorage.getItem('dv_saved_sessions');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((s) => s && typeof s.email === 'string' && s.email.includes('@'));
    } catch {
      return [];
    }
  });

  // Helper to persist/update a session in savedSessions
  const recordSession = (userData) => {
    if (!userData?.email) return;
    try {
      const email = userData.email.toLowerCase().trim();
      setSavedSessions((prev) => {
        const filtered = prev.filter((s) => s.email.toLowerCase() !== email);
        const updated = [
          {
            id: userData.id || userData._id || userData.docVaultId,
            name: userData.name || email.split('@')[0],
            email,
            pinLength: userData.pinLength || 4,
            tier: userData.tier || 'Vault Pro',
            lastActive: Date.now(),
          },
          ...filtered,
        ].slice(0, 5); // Keep at most 5 recent sessions
        localStorage.setItem('dv_saved_sessions', JSON.stringify(updated));
        return updated;
      });
    } catch (e) {
      console.warn('[DocVault Auth] Failed to record session:', e);
    }
  };

  // Helper to switch to an existing saved session
  const switchSession = (targetEmail) => {
    if (!targetEmail) return;
    const cleanEmail = targetEmail.toLowerCase().trim();
    const session = savedSessions.find((s) => s.email.toLowerCase() === cleanEmail);
    const pinLen = session?.pinLength || 4;

    // Lock current vault state
    setIsVaultUnlocked(false);
    sessionStorage.removeItem('docvault_unlocked');
    localStorage.removeItem('dv_last_activity_time');

    // Update active target credentials
    setPendingEmail(cleanEmail);
    setPinLength(pinLen);
    sessionStorage.setItem('docvault_pending_email', cleanEmail);
    sessionStorage.setItem('docvault_pin_length', pinLen.toString());
    localStorage.setItem('pending_pin_email', cleanEmail);

    if (session) {
      const switchedUser = {
        name: session.name,
        email: cleanEmail,
        pinLength: pinLen,
        tier: session.tier,
      };
      setUser(switchedUser);
      localStorage.setItem('docvault_user', JSON.stringify(switchedUser));
    }
  };

  // Remove a saved session from the device
  const removeSavedSession = (targetEmail) => {
    if (!targetEmail) return;
    const cleanEmail = targetEmail.toLowerCase().trim();
    setSavedSessions((prev) => {
      const filtered = prev.filter((s) => s.email.toLowerCase() !== cleanEmail);
      localStorage.setItem('dv_saved_sessions', JSON.stringify(filtered));
      return filtered;
    });

    if (user?.email?.toLowerCase() === cleanEmail || pendingEmail?.toLowerCase() === cleanEmail) {
      logout();
    }
  };

  // Remove all saved sessions from the device
  const clearAllSavedSessions = () => {
    localStorage.removeItem('dv_saved_sessions');
    setSavedSessions([]);
  };

  // Auto-Lock Vault: Detects 10-minute rest / inactivity AND mobile device sleep / backgrounding
  useEffect(() => {
    // Only monitor if vault is unlocked and user has autoLockEnabled (default true)
    if (!isVaultUnlocked || user?.autoLockEnabled === false) return;

    const recordActivity = () => {
      localStorage.setItem('dv_last_activity_time', Date.now().toString());
    };

    const checkInactivity = () => {
      const lastStr = localStorage.getItem('dv_last_activity_time');
      if (!lastStr) {
        recordActivity();
        return;
      }
      const elapsed = Date.now() - parseInt(lastStr, 10);
      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        console.info('[Security Auto-Lock] 10 minutes elapsed at rest or in sleep. Locking vault.');
        lockVault();
      }
    };

    // User interaction listeners to keep session alive when actively using app
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach((ev) => window.addEventListener(ev, recordActivity, { passive: true }));

    // Periodic check every 15s to catch timer expiration while screen remains on
    const interval = setInterval(checkInactivity, 15000);

    // CRITICAL FOR MOBILE: When phone sleeps or tab is backgrounded, setTimeout freezes.
    // When the user wakes phone up or switches back, visibilitychange & focus fire immediately.
    const handleWakeup = () => {
      if (document.visibilityState === 'visible') {
        checkInactivity();
      }
    };

    document.addEventListener('visibilitychange', handleWakeup);
    window.addEventListener('focus', handleWakeup);

    // Initial check on mount
    checkInactivity();

    return () => {
      activityEvents.forEach((ev) => window.removeEventListener(ev, recordActivity));
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleWakeup);
      window.removeEventListener('focus', handleWakeup);
    };
  }, [isVaultUnlocked, user?.autoLockEnabled]);
  const handleLoginSuccess = (userData, requiresPin = true) => {
    setUser(userData);
    setPendingEmail(userData.email);
    recordSession(userData);
    const len = userData.pinLength || 4;
    setPinLength(len);
    sessionStorage.setItem('docvault_pin_length', len.toString());
    sessionStorage.setItem('docvault_pending_email', userData.email);
    localStorage.setItem('pending_pin_email', userData.email);
    localStorage.setItem(`dv_pin_len_${userData.email.toLowerCase()}`, len.toString());
    setIsVaultUnlocked(false);
    sessionStorage.removeItem('docvault_unlocked');
  };

  // Step 2 PIN Verification Success (or post-register) -> Unlock App
  const handlePinSuccess = (authToken, userData) => {
    setToken(authToken);
    setUser(userData);
    setPendingEmail(userData.email);
    recordSession(userData);
    if (userData.pinLength) {
      setPinLength(userData.pinLength);
      sessionStorage.setItem('docvault_pin_length', userData.pinLength.toString());
    }
    setIsVaultUnlocked(true);
    localStorage.setItem('docvault_token', authToken);
    localStorage.setItem('token', authToken);
    localStorage.setItem('docvault_user', JSON.stringify(userData));
    sessionStorage.setItem('docvault_unlocked', 'true');
    sessionStorage.setItem('docvault_pending_email', userData.email);
    localStorage.setItem('dv_last_activity_time', Date.now().toString());
  };

  // Register function called by RegisterPage
  const register = async (formData) => {
    try {
      const res = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        return { success: false, error: res.error || res.message || 'Registration failed.' };
      }

      handlePinSuccess(res.token, res.user);
      return { success: true, user: res.user, token: res.token };
    } catch (err) {
      return { success: false, error: err.message || 'Network error during registration.' };
    }
  };

  // Login function (Step 1) called by LoginPage
  const login = async (email, password) => {
    try {
      const res = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        return { success: false, error: res.error || res.message || 'Invalid email or password.' };
      }

      handleLoginSuccess(res.user, res.requiresPin);
      return { success: true, user: res.user, requiresPin: res.requiresPin };
    } catch (err) {
      return { success: false, error: err.message || 'Network error during login.' };
    }
  };

  // Google Cloud OAuth / Google ID Token login
  const loginWithGoogleToken = async (idToken, accessToken) => {
    try {
      const res = await apiRequest('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ idToken, access_token: accessToken }),
      });

      if (!res.ok) {
        return { success: false, error: res.error || res.message || 'Google authentication failed.' };
      }

      if (res.token) {
        localStorage.setItem('token', res.token);
        localStorage.setItem('docvault_token', res.token);
      }

      handleLoginSuccess(res.user, res.requiresPin);
      return { 
        success: true, 
        user: res.user, 
        requiresPin: res.requiresPin, 
        requiresPinSetup: res.requiresPinSetup,
        isNewUser: res.isNewUser 
      };
    } catch (err) {
      return { success: false, error: err.message || 'Network error during Google authentication.' };
    }
  };

  // Setup Vault PIN and optional Master Password (e.g. for Google OAuth new accounts)
  const setupCredentials = async ({ email, pin, password }) => {
    try {
      const res = await apiRequest('/api/auth/setup-credentials', {
        method: 'POST',
        body: JSON.stringify({ email, pin, password }),
      });

      if (!res.ok && !res.success) {
        return { success: false, error: res.error || res.message || 'Failed to setup vault credentials.' };
      }

      if (res.token && res.user) {
        handlePinSuccess(res.token, res.user);
        return { success: true, user: res.user };
      }

      return { success: false, error: 'Invalid response from server.' };
    } catch (err) {
      return { success: false, error: err.message || 'Network error during credentials setup.' };
    }
  };

  // Google OAuth / Firebase ID Token login
  const loginWithFirebaseToken = async (idToken) => {
    try {
      const res = await apiRequest('/api/auth/firebase', {
        method: 'POST',
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        return { success: false, error: res.error || res.message || 'Firebase authentication failed.' };
      }

      if (res.token) {
        localStorage.setItem('token', res.token);
        localStorage.setItem('docvault_token', res.token);
      }

      handleLoginSuccess(res.user, res.requiresPin);
      return { 
        success: true, 
        user: res.user, 
        requiresPin: res.requiresPin,
        requiresPinSetup: Boolean(res.requiresPinSetup || !res.user?.pinSet),
        isNewUser: Boolean(res.isNewUser)
      };
    } catch (err) {
      return { success: false, error: err.message || 'Network error during Firebase authentication.' };
    }
  };

  // Verify PIN function (Step 2) called by EnterPinPage
  // Reset PIN with OTP when forgotten
  const resetPinWithOtp = async (email, otp, newPin) => {
    try {
      const res = await apiRequest('/api/auth/reset-pin', {
        method: 'POST',
        body: JSON.stringify({ email, otp, newPin }),
      });

      if (res.success && res.token && res.user) {
        handlePinSuccess(res.token, res.user);
        return { success: true, message: res.message };
      }
      return { success: false, error: res.error || 'Failed to reset PIN.' };
    } catch (err) {
      return { success: false, error: err.message || 'Error resetting PIN.' };
    }
  };

  const verifyPin = async (email, pin) => {
    try {
      const res = await apiRequest('/api/auth/verify-pin', {
        method: 'POST',
        body: JSON.stringify({ email, pin }),
      });

      if (!res.ok) {
        return {
          success: false,
          error: res.error || res.message || 'Incorrect Vault PIN.',
          requiresPinSetup: Boolean(res.requiresPinSetup),
          lockUntil: res.lockUntil || null,
          remainingSeconds: res.remainingSeconds || null,
          attemptsLeft: res.attemptsLeft ?? null,
        };
      }

      handlePinSuccess(res.token, res.user);
      return { success: true, user: res.user, token: res.token };
    } catch (err) {
      return { success: false, error: err.message || 'Network error during PIN verification.' };
    }
  };

  // Update user session & security settings
  const updateSessionPreference = async (settings) => {
    try {
      const payload = typeof settings === 'boolean' ? { singleSessionOnly: settings } : settings;
      const res = await apiRequest('/api/auth/session-settings', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      if (res.success) {
        if (res.token) {
          setToken(res.token);
          localStorage.setItem('token', res.token);
          localStorage.setItem('docvault_token', res.token);
        }
        setUser((prev) => {
          const updated = {
            ...prev,
            ...(res.singleSessionOnly !== undefined ? { singleSessionOnly: res.singleSessionOnly } : {}),
            ...(res.autoLockEnabled !== undefined ? { autoLockEnabled: res.autoLockEnabled } : {}),
          };
          localStorage.setItem('docvault_user', JSON.stringify(updated));
          return updated;
        });
        return {
          success: true,
          singleSessionOnly: res.singleSessionOnly,
          autoLockEnabled: res.autoLockEnabled,
        };
      }
      return { success: false, error: res.error || 'Failed to update settings.' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // Register WebAuthn Biometric Credential on current device
  const registerBiometrics = async (deviceName = 'My Device') => {
    try {
      if (!window.PublicKeyCredential) {
        return { success: false, error: 'Biometrics / WebAuthn is not supported on this browser.' };
      }

      // Generate random challenge
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      const userIdBytes = new TextEncoder().encode(user?.id || 'docvault_user');

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'DocVault', id: window.location.hostname },
          user: {
            id: userIdBytes,
            name: user?.email || 'user',
            displayName: user?.name || 'Vault Custodian',
          },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
          authenticatorSelection: {
            authenticatorAttachment: 'platform', // Built-in Touch ID / Face ID / Fingerprint
            userVerification: 'required',
          },
          timeout: 60000,
        },
      });

      if (!credential) {
        return { success: false, error: 'Biometric registration cancelled.' };
      }

      // Convert raw ID to Base64
      const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
      const publicKey = btoa(String.fromCharCode(...new Uint8Array(credential.response.attestationObject)));

      const res = await apiRequest('/api/auth/biometrics/register', {
        method: 'POST',
        body: JSON.stringify({ credentialId, publicKey, deviceName }),
      });

      if (res.success) {
        localStorage.setItem(`dv_bio_cred_${user?.email}`, credentialId);
        setUser((prev) => {
          const updated = { ...prev, biometricsEnabled: true, hasBiometrics: true };
          localStorage.setItem('docvault_user', JSON.stringify(updated));
          return updated;
        });
        return { success: true };
      }
      return { success: false, error: res.error || 'Registration failed.' };
    } catch (err) {
      console.warn('[Biometrics Register]', err);
      return { success: false, error: err.message || 'Sensor cancelled or unavailable.' };
    }
  };

  // Verify WebAuthn Biometric and Unlock Vault
  const unlockWithBiometrics = async (emailToUse) => {
    try {
      const activeEmail = emailToUse || pendingEmail || user?.email;
      if (!activeEmail) {
        return { success: false, error: 'No user email found.' };
      }

      if (!window.PublicKeyCredential) {
        return { success: false, error: 'Biometrics is not supported on this device.' };
      }

      const storedCredId = localStorage.getItem(`dv_bio_cred_${activeEmail}`);
      if (!storedCredId) {
        return { success: false, error: 'No fingerprint registered on this browser yet. Please use your PIN and enable it in Settings.' };
      }

      const rawId = Uint8Array.from(atob(storedCredId), c => c.charCodeAt(0));
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      // Prompt device biometric sensor (Touch ID / Fingerprint)
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{ id: rawId, type: 'public-key' }],
          userVerification: 'required',
          timeout: 60000,
        },
      });

      if (!assertion) {
        return { success: false, error: 'Biometric verification cancelled.' };
      }

      const res = await apiRequest('/api/auth/biometrics/verify', {
        method: 'POST',
        body: JSON.stringify({
          email: activeEmail,
          credentialId: storedCredId,
        }),
      });

      if (!res.ok) {
        return {
          success: false,
          error: res.error || 'Biometric authentication rejected.',
          lockUntil: res.lockUntil || null,
          remainingSeconds: res.remainingSeconds || null,
        };
      }

      handlePinSuccess(res.token, res.user);
      return { success: true, user: res.user, token: res.token };
    } catch (err) {
      console.warn('[Biometrics Verify]', err);
      return { success: false, error: err.message || 'Biometric sensor error.' };
    }
  };

  // Lock Vault (keeps user credentials saved, requires PIN to re-enter)
  const lockVault = () => {
    setIsVaultUnlocked(false);
    sessionStorage.removeItem('docvault_unlocked');
    localStorage.removeItem('dv_last_activity_time');
  };

  // Lock Session (records session to savedSessions, locks vault)
  const lockSession = () => {
    if (user?.email) {
      recordSession(user);
    }
    lockVault();
  };

  // Global Keyboard Shortcut: Cmd+L or Ctrl+L locks the active session
  useEffect(() => {
    const handleGlobalLockShortcut = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'l' || e.key === 'L')) {
        if (isVaultUnlocked) {
          e.preventDefault();
          lockSession();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalLockShortcut);
    return () => window.removeEventListener('keydown', handleGlobalLockShortcut);
  }, [isVaultUnlocked, user]);

  // Full Logout (cleans up all session tokens and credentials completely)
  const logout = () => {
    setUser(null);
    setToken(null);
    setIsVaultUnlocked(false);
    setPendingEmail('');
    localStorage.removeItem('docvault_user');
    localStorage.removeItem('docvault_token');
    localStorage.removeItem('token');
    localStorage.removeItem('pending_pin_email');
    localStorage.removeItem('dv_last_activity_time');
    sessionStorage.removeItem('docvault_unlocked');
    sessionStorage.removeItem('docvault_pending_email');
    sessionStorage.removeItem('docvault_pin_length');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isVaultUnlocked,
        pendingEmail,
        pinLength,
        savedSessions,
        setPinLength,
        setPendingEmail,
        recordSession,
        switchSession,
        removeSavedSession,
        clearAllSavedSessions,
        handleLoginSuccess,
        handlePinSuccess,
        register,
        login,
        loginWithGoogleToken,
        loginWithFirebaseToken,
        setupCredentials,
        verifyPin,
        resetPinWithOtp,
        updateSessionPreference,
        registerBiometrics,
        unlockWithBiometrics,
        lockVault,
        lockSession,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
