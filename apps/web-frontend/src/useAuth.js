import { useCallback, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { getFirebaseAuth, googleProvider, isFirebaseConfigured } from './firebase';

const LEGACY_LOGIN_FLAG = 'lineage_is_logged_in';

/**
 * Google sign-in via Firebase Auth.
 *
 * When Firebase is not configured the hook falls back to the previous simulated
 * login so local-only use keeps working — the app is usable without a cloud
 * project, it just cannot sync.
 */
export default function useAuth() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!isFirebaseConfigured);
  const [error, setError] = useState(null);

  // Simulated session, used only when there is no Firebase project.
  const [localSignedIn, setLocalSignedIn] = useState(
    () => localStorage.getItem(LEGACY_LOGIN_FLAG) === 'true'
  );

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const auth = getFirebaseAuth();
    if (!auth) return;
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (isFirebaseConfigured) return;
    localStorage.setItem(LEGACY_LOGIN_FLAG, String(localSignedIn));
  }, [localSignedIn]);

  const signIn = useCallback(async () => {
    setError(null);
    if (!isFirebaseConfigured) {
      setLocalSignedIn(true);
      return;
    }
    try {
      await signInWithPopup(getFirebaseAuth(), googleProvider());
    } catch (e) {
      // A closed popup is a deliberate user action, not a failure worth showing.
      if (e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/cancelled-popup-request') {
        setError(e?.message || 'Sign-in failed.');
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    if (!isFirebaseConfigured) {
      setLocalSignedIn(false);
      return;
    }
    try {
      await firebaseSignOut(getFirebaseAuth());
    } catch (e) {
      setError(e?.message || 'Sign-out failed.');
    }
  }, []);

  return {
    user,
    uid: user?.uid || null,
    displayName: user?.displayName || null,
    email: user?.email || null,
    isSignedIn: isFirebaseConfigured ? Boolean(user) : localSignedIn,
    ready,
    error,
    signIn,
    signOut,
    canSync: isFirebaseConfigured,
  };
}
