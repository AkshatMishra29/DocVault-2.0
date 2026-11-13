const PRODUCTION_BACKEND_URL = 'https://docvault-backend-tiyz.onrender.com';

function getApiBaseUrl() {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    // Local development (Vite on :5173, Express Backend on :5001)
    if (host === 'localhost' || host === '127.0.0.1') {
      return `http://${host}:5001`;
    }
    // Hosted on Render cloud or custom domain -> point to production backend
    return PRODUCTION_BACKEND_URL;
  }
  return PRODUCTION_BACKEND_URL;
}

export const API_BASE_URL = getApiBaseUrl();

/**
 * Standard HTTP API Request Wrapper
 * Centralizes Authorization headers, JSON body serialization, and error handling.
 */
export async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...options.headers };

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Auto-detect JSON payload unless FormData is sent
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json();

    // Detect session termination by another device or invalid session token
    if (data.code === 'SESSION_TERMINATED' || (response.status === 401 && data.error?.includes('terminated'))) {
      localStorage.removeItem('token');
      localStorage.removeItem('docvault_token');
      localStorage.removeItem('docvault_user');
      sessionStorage.removeItem('docvault_unlocked');
      alert('Your DocVault session was terminated because another device signed into your vault.');
      window.location.href = '/login';
    } else if (
      response.status === 401 &&
      !endpoint.includes('/auth/login') &&
      !endpoint.includes('/auth/verify-pin') &&
      !endpoint.includes('/auth/send-otp') &&
      !endpoint.includes('/auth/verify-otp')
    ) {
      // Invalid or expired session credentials on authenticated resource
      localStorage.removeItem('token');
      localStorage.removeItem('docvault_token');
      localStorage.removeItem('docvault_user');
      sessionStorage.removeItem('docvault_unlocked');
      window.location.href = '/login';
    }

    return { status: response.status, ok: response.ok, ...data };
  }

  // If endpoint is an API route but server returned HTML (e.g. 404/502/SPA fallback), fail cleanly
  if (endpoint.startsWith('/api/') && contentType.includes('text/html')) {
    console.error(`[API Error] Expected JSON from ${endpoint} but received HTML.`);
    return {
      status: response.status,
      ok: false,
      success: false,
      error: 'Backend API is currently unreachable. Please verify backend deployment.',
    };
  }

  // Handle blob/text/raw streams (e.g. calendar.ics, file downloads)
  return response;
}

