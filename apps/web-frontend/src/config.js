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
export const FALLBACK_API_KEY_STORAGE = 'google_fallback_api_key';

export const SESSIONS_STORAGE = 'lineage_sessions';
export const SYNC_CONSENT_STORAGE = 'lineage_sync_consent';

// Firebase web config. These values are not secrets — they identify the project to the
// client, and access is governed by the Firestore security rules in firestore.rules.
// See .env.example; when unset the app runs local-only with sync unavailable.
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Cross-device sync is only offered when the project is actually configured, so an
// unconfigured checkout still runs with local-only storage rather than erroring.
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);
