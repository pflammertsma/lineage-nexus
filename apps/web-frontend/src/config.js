// Shared client configuration.
//
// The backend base URL is build-time configurable so production bundles can point at the
// deployed Cloud Run service instead of a developer's machine. Set VITE_API_BASE_URL in
// `.env` (see .env.example).
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8081';

// Single source of truth for where the BYOK Gemini key lives in localStorage. Both the
// settings modal and the chat request read through this constant so they cannot drift apart.
export const API_KEY_STORAGE = 'google_api_key';
