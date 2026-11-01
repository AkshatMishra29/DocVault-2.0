// ============================================================================
// Firebase Integration (Temporarily commented out to avoid missing dependency)
// ============================================================================

/*
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
  apiKey: "AIzaSyBWcS6D3ZA8SstEErfZSp2qxZBMffXdFJg",
  authDomain: "docvault-app-f867f.firebaseapp.com",
  projectId: "docvault-app-f867f",
  storageBucket: "docvault-app-f867f.firebasestorage.app",
  messagingSenderId: "110208453077",
  appId: "1:110208453077:web:dea88c1c503c1ee9dcd55c",
  measurementId: "G-FR59SHRYDL"
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
*/

export const app = null;
export const auth = null;
export const googleProvider = null;

/**
 * Trigger Google OAuth popup (stubbed for now)
 */
export async function signInWithGoogle() {
  console.warn("[Firebase] signInWithGoogle is currently disabled.");
  return null;
}

/**
 * Send passwordless Email sign-in link (stubbed for now)
 */
export async function sendEmailLoginLink(email) {
  console.warn("[Firebase] sendEmailLoginLink is currently disabled.");
  return false;
}

/**
 * Check and complete Email Link sign-in (stubbed for now)
 */
export async function verifyEmailLinkSignIn() {
  console.warn("[Firebase] verifyEmailLinkSignIn is currently disabled.");
  return null;
}

export default app;
