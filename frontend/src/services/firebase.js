import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  sendSignInLinkToEmail, 
  isSignInWithEmailLink, 
  signInWithEmailLink 
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBWcS6D3ZA8SstEErfZSp2qxZBMffXdFJg",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "docvault-app-f867f.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "docvault-app-f867f",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "docvault-app-f867f.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "110208453077",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:110208453077:web:dea88c1c503c1ee9dcd55c",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-FR59SHRYDL"
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Trigger Google OAuth popup and return verified identity + ID token
 */
export async function signInWithGoogle() {
  try {
    // Clear any active Firebase client session to force a fresh account selection
    try {
      await auth.signOut();
    } catch (_) {}

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    const idToken = await user.getIdToken(true);
    return {
      user,
      idToken,
      email: (user.email || '').toLowerCase().trim(),
      displayName: user.displayName || user.email?.split('@')[0] || 'Vault User',
      photoURL: user.photoURL || null,
    };
  } catch (err) {
    if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
      console.info("[Firebase] Google popup was closed by user.");
      return null;
    }
    console.error("[Firebase] Google Sign-In error:", err.code, err.message);
    throw new Error(err.message || 'Google Sign-In failed.');
  }
}

/**
 * Send passwordless Email sign-in link
 */
export async function sendEmailLoginLink(email) {
  const actionCodeSettings = {
    url: `${window.location.origin}/auth/verify`,
    handleCodeInApp: true,
  };
  try {
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    window.localStorage.setItem('emailForSignIn', email);
    return true;
  } catch (err) {
    console.error("[Firebase] sendEmailLoginLink error:", err);
    return false;
  }
}

/**
 * Check and complete Email Link sign-in
 */
export async function verifyEmailLinkSignIn() {
  try {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      let email = window.localStorage.getItem('emailForSignIn');
      if (!email) {
        email = window.prompt('Please provide your email for confirmation');
      }
      if (email) {
        const result = await signInWithEmailLink(auth, email, window.location.href);
        window.localStorage.removeItem('emailForSignIn');
        const idToken = await result.user.getIdToken();
        return { user: result.user, idToken, email };
      }
    }
    return null;
  } catch (err) {
    console.error("[Firebase] verifyEmailLinkSignIn error:", err);
    return null;
  }
}

export default app;
