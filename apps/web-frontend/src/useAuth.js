import { useCallback, useEffect, useState } from 'react';
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { getFirebaseAuth, googleProvider, isFirebaseConfigured } from './firebase';

const LEGACY_LOGIN_FLAG = 'lineage_is_logged_in';

// A popup is the better experience where it works, but it is not always available:
// in-app browsers (opening a link from a mail or social app), popup blockers, and
// some privacy modes all refuse it. Falling back to a full-page redirect means
// sign-in still completes instead of failing with a message the user cannot act on.
const POPUP_UNAVAILABLE = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
]);

// Closing the popup, or clicking sign-in twice, is a deliberate user action.
const USER_DISMISSED = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
]);

/**
 * Firebase's raw messages are written for developers ("Firebase: Error
 * (auth/unauthorized-domain)."), which is no help to someone trying to sign in.
 * The two configuration failures are called out by name because they are the ones
 * that will appear on a fresh deployment, and knowing which it is saves an hour.
 */
function describeAuthError(e) {
  switch (e?.code) {
    case 'auth/unauthorized-domain':
      return 'This site is not authorised for sign-in. Add its domain under Firebase Authentication → Settings → Authorized domains.';
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not enabled for this project. Enable the Google provider in Firebase Authentication.';
    case 'auth/network-request-failed':
      return 'Could not reach the sign-in service. Check your connection and try again.';
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts. Please wait a moment and try again.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in method.';
    default:
      return e?.message || 'Sign-in failed.';
  }
}

/**
 * Google sign-in via Firebase Auth.
 *
 * When Firebase is not configured the hook falls back to the previous simulated
 * login so local-only use keeps working — the app is usable without a cloud
 * project, it just cannot sync.
 */
export default function useAuth() {
  const [user, setUser] = useState(null);
  // Read from the signed ID token's custom claims, not from a Firestore document:
  // a claim is inside the token the API already verifies, so the same fact drives
  // the UI and the server without a second lookup that could disagree.
  //
  // This gates VISIBILITY ONLY. It is a value from the client, so the API must
  // verify the claim itself on every admin request and never trust this.
  const [isAdmin, setIsAdmin] = useState(false);
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

    // Completes a redirect sign-in. onAuthStateChanged delivers the session on its
    // own; this call exists to surface an error that would otherwise be swallowed,
    // leaving the user back on the landing page with no explanation.
    getRedirectResult(auth).catch((e) => setError(describeAuthError(e)));

    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setReady(true);
      if (!nextUser) {
        setIsAdmin(false);
        return;
      }
      try {
        const token = await nextUser.getIdTokenResult();
        setIsAdmin(token.claims.admin === true);
      } catch {
        // A failed claim read must not grant access.
        setIsAdmin(false);
      }
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
    const auth = getFirebaseAuth();
    try {
      await signInWithPopup(auth, googleProvider());
    } catch (e) {
      if (USER_DISMISSED.has(e?.code)) return;
      if (POPUP_UNAVAILABLE.has(e?.code)) {
        // Navigates away; the result is picked up by getRedirectResult on return.
        try {
          await signInWithRedirect(auth, googleProvider());
          return;
        } catch (redirectError) {
          setError(describeAuthError(redirectError));
          return;
        }
      }
      setError(describeAuthError(e));
    }
  }, []);

  /**
   * A fresh ID token for calling an authenticated API. Firebase refreshes it
   * automatically when it is close to expiry, so this is cheap to call per request
   * and always returns something currently valid.
   */
  const getIdToken = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth?.currentUser) return null;
    try {
      return await auth.currentUser.getIdToken();
    } catch {
      return null;
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
    displayName: user?.displayName || (localSignedIn ? 'Researcher' : null),
    email: user?.email || (localSignedIn ? 'local@device' : null),
    photoURL: user?.photoURL || null,
    isSignedIn: isFirebaseConfigured ? Boolean(user) : localSignedIn,
    // True when the session is a local stand-in rather than a real Google account.
    // The UI must say so: a fake sign-in that looks real is worse than none.
    isSimulated: !isFirebaseConfigured && localSignedIn,
    // Never true without a real Firebase session — the simulated login cannot
    // grant admin, or anyone could set a localStorage flag and see the dashboard.
    isAdmin: isFirebaseConfigured && isAdmin,
    getIdToken,
    ready,
    error,
    signIn,
    signOut,
    canSync: isFirebaseConfigured,
  };
}
