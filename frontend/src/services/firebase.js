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

// Singleton App Initialization - guarantees default app exists across all modules
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firebase Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

/**
 * Trigger Google OAuth popup
 */
export async function signInWithGoogle() {
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;
  const idToken = await user.getIdToken();
  return {
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    idToken,
  };
}

/**
 * Send passwordless Email sign-in link
 */
export async function sendEmailLoginLink(email) {
  const actionCodeSettings = {
    // Route to dedicated verification page
    url: `${window.location.origin}/auth/verify?emailLink=true`,
    handleCodeInApp: true,
  };

  await sendSignInLinkToEmail(auth, email, actionCodeSettings);
  window.localStorage.setItem('docvault_emailForSignIn', email);
  return true;
}

/**
 * Check and complete Email Link sign-in
 */
export async function verifyEmailLinkSignIn() {
  if (isSignInWithEmailLink(auth, window.location.href)) {
    let email = window.localStorage.getItem('docvault_emailForSignIn');
    if (!email) {
      email = window.prompt('Please confirm your email address for instant unlock');
    }
    if (email) {
      const result = await signInWithEmailLink(auth, email, window.location.href);
      window.localStorage.removeItem('docvault_emailForSignIn');
      const idToken = await result.user.getIdToken();
      return {
        email: result.user.email,
        displayName: result.user.displayName,
        idToken,
      };
    }
  }
  return null;
}

export default app;
