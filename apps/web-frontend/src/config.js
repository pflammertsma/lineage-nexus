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

export const ADMIN_HARVEST_STATUS_FILTER_STORAGE = 'lineage_admin_harvest_status_filter';
export const ADMIN_CHART_ARCHIVE_FILTER_STORAGE = 'lineage_admin_chart_archive_filter';
export const ADMIN_CHART_RANGE_STORAGE = 'lineage_admin_chart_range';

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

// Google Analytics. Unset means no analytics at all — the gtag script is never
// fetched — so a local checkout and any fork stay untracked by default.
export const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || '';
export const isAnalyticsConfigured = Boolean(GA_MEASUREMENT_ID);
export const ANALYTICS_CONSENT_STORAGE = 'lineage_analytics_consent';

// Error monitoring. Unset means nothing is loaded and nothing is reported.
// See src/monitoring.js — reports are scrubbed of research content before send.
export const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';
export const isMonitoringConfigured = Boolean(SENTRY_DSN);

// The archival/admin service (separate from the research API above). Unset means
// the admin dashboard reports that it is not configured rather than guessing a host.
export const ADMIN_API_BASE_URL = import.meta.env.VITE_ADMIN_API_BASE_URL || '';

// Dynamic store for Archive Names supplied by the archival API server (server.py).
// The backend API is the single authoritative owner of institutional archive names.
let dynamicArchiveNames = {};

export function setArchiveNames(names) {
  if (names && typeof names === 'object') {
    dynamicArchiveNames = { ...dynamicArchiveNames, ...names };
  }
}

// Institutional Register Kinds Single Source of Truth
export const REGISTER_KIND_LABELS = {
  bsg: 'Birth Certificates (bsg)',
  bsh: 'Marriage Certificates (bsh)',
  bso: 'Death Certificates (bso)',
  bev: 'Population Register (bev)',
  dtb_d: 'Baptism Register (dtb_d)',
  dtb_t: 'Church Marriages (dtb_t)',
  dtb_b: 'Burial Register (dtb_b)',
  not: 'Notarial Deeds (not)',
};

export function getKindLabel(kind) {
  if (!kind) return '';
  const key = String(kind).toLowerCase();
  return REGISTER_KIND_LABELS[key] || `register: ${kind}`;
}

export function getArchiveName(code) {
  if (!code) return 'Unknown Archive';
  const key = String(code).toLowerCase();
  return dynamicArchiveNames[key] || `Archive ${String(code).toUpperCase()}`;
}
