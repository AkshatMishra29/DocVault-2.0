/**
 * Google Cloud Identity Services OAuth Helper
 * Uses Google Identity Services script or @react-oauth/google
 */

export const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '940417312093-vftovh8cf0r3q5jr45jt1659bgnh7n1e.apps.googleusercontent.com';

/**
 * Trigger native Google Cloud OAuth popup using Google Identity Services (GIS)
 * Returns a promise with { idToken, email, name, picture }
 */
export function triggerGoogleSignIn() {
  return new Promise((resolve, reject) => {
    // If google accounts script is already loaded
    if (window.google?.accounts?.id) {
      initAndPromptGoogle(resolve, reject);
      return;
    }

    // Dynamically inject Google Identity Services script if not present
    const existingScript = document.getElementById('google-client-script');
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'google-client-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        initAndPromptGoogle(resolve, reject);
      };
      script.onerror = () => {
        reject(new Error('Failed to load Google Identity Services SDK'));
      };
      document.body.appendChild(script);
    } else {
      existingScript.onload = () => initAndPromptGoogle(resolve, reject);
    }
  });
}

function initAndPromptGoogle(resolve, reject) {
  try {
    /* global google */
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => {
        if (!response.credential) {
          reject(new Error('No credential returned from Google.'));
          return;
        }

        // Parse JWT payload safely
        try {
          const base64Url = response.credential.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(
            atob(base64)
              .split('')
              .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join('')
          );
          const payload = JSON.parse(jsonPayload);

          resolve({
            idToken: response.credential,
            email: payload.email,
            name: payload.name || payload.given_name,
            picture: payload.picture,
          });
        } catch {
          resolve({
            idToken: response.credential,
          });
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    // Prompt user with one-tap or select account prompt
    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        // Fallback: render hidden button and click it to trigger official popup
        renderAndClickGoogleButton(resolve, reject);
      }
    });
  } catch (err) {
    reject(err);
  }
}

function renderAndClickGoogleButton(resolve, reject) {
  try {
    let container = document.getElementById('g_id_hidden_signin');
    if (!container) {
      container = document.createElement('div');
      container.id = 'g_id_hidden_signin';
      container.style.position = 'fixed';
      container.style.top = '-9999px';
      container.style.left = '-9999px';
      document.body.appendChild(container);
    }

    window.google.accounts.id.renderButton(container, {
      theme: 'outline',
      size: 'large',
      type: 'standard',
      click_listener: () => {},
    });

    const btn = container.querySelector('div[role="button"]') || container.querySelector('button');
    if (btn) {
      btn.click();
    } else {
      reject(new Error('Google Sign-In button failed to render. Check popup blockers.'));
    }
  } catch (err) {
    reject(err);
  }
}
