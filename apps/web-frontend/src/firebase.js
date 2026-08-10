import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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

export function getDb() {
  if (!ensureApp()) return null;
  if (!dbInstance) dbInstance = getFirestore(app);
  return dbInstance;
}

export function googleProvider() {
  return new GoogleAuthProvider();
}

export { isFirebaseConfigured };
