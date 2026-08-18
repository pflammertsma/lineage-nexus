import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { firebaseConfig, isFirebaseConfigured } from './config';

// Initialised lazily so an unconfigured checkout never touches the SDK. Every consumer
// must handle null — that is the local-only path, not an error state.
let app = null;
let authInstance = null;
let dbInstance = null;

function ensureApp() {
  if (!isFirebaseConfigured) return null;
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirebaseAuth() {
  if (!ensureApp()) return null;
  if (!authInstance) authInstance = getAuth(app);
  return authInstance;
}

// Firestore is the single largest dependency in the bundle, and most visitors
// never reach it: it is only needed after signing in *and* opting in to sync.
// Importing it dynamically keeps it out of the initial download.
let firestoreModule = null;

/**
 * Resolves to the Firestore SDK plus a `db` handle, or null when Firebase is
 * unconfigured. Every caller must handle null — that is the local-only path.
 */
export async function loadFirestore() {
  if (!ensureApp()) return null;
  if (!firestoreModule) firestoreModule = await import('firebase/firestore');
  if (!dbInstance) dbInstance = firestoreModule.getFirestore(app);
  return { db: dbInstance, ...firestoreModule };
}

export function googleProvider() {
  return new GoogleAuthProvider();
}

export { isFirebaseConfigured };
