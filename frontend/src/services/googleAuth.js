/**
 * Google Cloud Identity Services OAuth Helper
 * Opens official Google OAuth 2.0 popup window directly without page redirect
 */

export const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '940417312093-vftovh8cf0r3q5jr45jt1659bgnh7n1e.apps.googleusercontent.com';

/**
 * Trigger official Google OAuth 2.0 popup window
 * Resolves with { idToken, accessToken, email, name }
 */
export function triggerGoogleSignIn() {
  return new Promise((resolve, reject) => {
    // 1. Calculate centered popup coordinates
    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const redirectUri = window.location.origin;
    const nonce = Math.random().toString(36).substring(2, 15);
    const state = Math.random().toString(36).substring(2, 15);

    // Google OAuth 2.0 endpoint requesting ID Token & OpenID profile
    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=token%20id_token` +
      `&scope=${encodeURIComponent('openid email profile')}` +
      `&nonce=${encodeURIComponent(nonce)}` +
      `&state=${encodeURIComponent(state)}` +
      `&prompt=select_account`;

    const popup = window.open(
      authUrl,
      'google_oauth_popup',
      `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no,location=no,resizable=yes,scrollbars=yes`
    );

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      reject(new Error('Popup blocked by browser. Please allow popups for this site.'));
      return;
    }

    // Focus popup
    try {
      popup.focus();
    } catch (_) {}

    // 2. Poll popup location for redirect fragment (hash contains id_token and access_token)
    let finished = false;

    const interval = setInterval(() => {
      try {
        if (!popup || popup.closed) {
          clearInterval(interval);
          if (!finished) {
            reject(new Error('Google sign-in popup was closed.'));
          }
          return;
        }

        // Check if popup returned to our origin
        const currentUrl = popup.location.href;
        if (currentUrl && currentUrl.startsWith(redirectUri)) {
          const hash = popup.location.hash || '';
          const search = popup.location.search || '';

          // Look for id_token and access_token in URL hash params
          const params = new URLSearchParams(hash.startsWith('#') ? hash.substring(1) : search);
          const idToken = params.get('id_token');
          const accessToken = params.get('access_token');
          const error = params.get('error');

          if (error) {
            finished = true;
            clearInterval(interval);
            popup.close();
            reject(new Error(`Google authentication error: ${error}`));
            return;
          }

          if (idToken || accessToken) {
            finished = true;
            clearInterval(interval);
            popup.close();

            // Decode user info from id_token if available
            let email = '';
            let name = '';
            if (idToken) {
              try {
                const base64Url = idToken.split('.')[1];
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                const jsonPayload = decodeURIComponent(
                  atob(base64)
                    .split('')
                    .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                    .join('')
                );
                const payload = JSON.parse(jsonPayload);
                email = payload.email || '';
                name = payload.name || payload.given_name || '';
              } catch (_) {}
            }

            resolve({
              idToken,
              accessToken,
              email,
              name,
            });
          }
        }
      } catch (crossOriginErr) {
        // Cross-origin access while user is on accounts.google.com is expected until redirect
      }
    }, 300);

    // Timeout protection after 2 minutes
    setTimeout(() => {
      if (!finished) {
        clearInterval(interval);
        try {
          if (!popup.closed) popup.close();
        } catch (_) {}
        reject(new Error('Google sign-in timed out.'));
      }
    }, 120000);
  });
}
