import { useCallback, useEffect, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { getDb } from './firebase';
import { SESSIONS_STORAGE, SYNC_CONSENT_STORAGE } from './config';
import { mergeSessions, sessionFingerprint } from './lib/mergeSessions';

const PUSH_DEBOUNCE_MS = 800;

function loadLocal() {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocal(sessions) {
  try {
    localStorage.setItem(SESSIONS_STORAGE, JSON.stringify(sessions));
    return null;
  } catch (e) {
    // localStorage is capped (~5MB). Report rather than crash the render:
    // losing the newest write is bad, taking the app down is worse.
    return e?.name === 'QuotaExceededError'
      ? 'Local storage is full. Delete older research sessions to keep saving new ones.'
      : 'Could not save sessions locally.';
  }
}

/**
 * Sessions state with an optional Firestore mirror.
 *
 * localStorage is always the working copy, so the app behaves identically with no
 * Firebase project, no network, or sync switched off. When the user has opted in,
 * changes are debounced upward and a snapshot listener brings other devices' edits
 * down through mergeSessions.
 */
export default function useSyncedSessions({ uid, syncEnabled }) {
  const [sessions, setSessions] = useState(loadLocal);
  const [storageError, setStorageError] = useState(null);
  const [syncState, setSyncState] = useState('idle'); // idle | syncing | synced | error

  // {sessionId: timestamp} of what this device last pushed, so a remote echo is
  // distinguishable from another device's newer edit.
  const pushedAtRef = useRef({});
  const fingerprintsRef = useRef({});
  const pushTimerRef = useRef(null);

  const active = Boolean(uid && syncEnabled);

  useEffect(() => {
    setStorageError(saveLocal(sessions));
  }, [sessions]);

  // Pull: adopt remote changes from other devices.
  useEffect(() => {
    if (!active) {
      setSyncState('idle');
      return;
    }
    const db = getDb();
    if (!db) return;

    setSyncState('syncing');
    const ref = collection(db, 'users', uid, 'sessions');
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        const remote = snapshot.docs.map(d => d.data());
        setSessions(local => mergeSessions(local, remote, pushedAtRef.current));
        setSyncState('synced');
      },
      () => setSyncState('error')
    );
    return unsubscribe;
  }, [active, uid]);

  // Push: mirror locally-changed sessions upward, debounced.
  useEffect(() => {
    if (!active) return;
    const db = getDb();
    if (!db) return;

    clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(async () => {
      const changed = sessions.filter(
        s => s?.id && fingerprintsRef.current[s.id] !== sessionFingerprint(s)
      );
      if (!changed.length) return;

      try {
        await Promise.all(changed.map(async (session) => {
          const updatedAt = Date.now();
          await setDoc(
            doc(db, 'users', uid, 'sessions', session.id),
            {
              id: session.id,
              title: session.title || 'Untitled research',
              messages: session.messages || [],
              updatedAt,
            },
            { merge: true }
          );
          pushedAtRef.current[session.id] = updatedAt;
          fingerprintsRef.current[session.id] = sessionFingerprint(session);
        }));
        setSyncState('synced');
      } catch {
        setSyncState('error');
      }
    }, PUSH_DEBOUNCE_MS);

    return () => clearTimeout(pushTimerRef.current);
  }, [sessions, active, uid]);

  const deleteSession = useCallback(async (id) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    delete pushedAtRef.current[id];
    delete fingerprintsRef.current[id];
    if (!active) return;
    const db = getDb();
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'users', uid, 'sessions', id));
    } catch {
      setSyncState('error');
    }
  }, [active, uid]);

  /**
   * Erases everything. `scope` is 'cloud' to leave this device's copy intact, or
   * 'all' to clear the device too.
   */
  const deleteAllData = useCallback(async (scope = 'all') => {
    if (uid) {
      const db = getDb();
      if (db) {
        try {
          const snapshot = await getDocs(collection(db, 'users', uid, 'sessions'));
          // Batches cap at 500 operations.
          const docs = snapshot.docs;
          for (let i = 0; i < docs.length; i += 450) {
            const batch = writeBatch(db);
            docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
          await deleteDoc(doc(db, 'users', uid)).catch(() => {});
        } catch {
          setSyncState('error');
          throw new Error('Could not delete your cloud data. Please try again.');
        }
      }
    }
    pushedAtRef.current = {};
    fingerprintsRef.current = {};
    if (scope === 'all') setSessions([]);
  }, [uid]);

  return {
    sessions,
    setSessions,
    deleteSession,
    deleteAllData,
    syncState,
    storageError,
  };
}

export function readSyncConsent(uid) {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(SYNC_CONSENT_STORAGE);
    const map = raw ? JSON.parse(raw) : {};
    return Object.prototype.hasOwnProperty.call(map, uid) ? Boolean(map[uid]) : null;
  } catch {
    return null;
  }
}

export function writeSyncConsent(uid, enabled) {
  if (!uid) return;
  try {
    const raw = localStorage.getItem(SYNC_CONSENT_STORAGE);
    const map = raw ? JSON.parse(raw) : {};
    map[uid] = Boolean(enabled);
    localStorage.setItem(SYNC_CONSENT_STORAGE, JSON.stringify(map));
  } catch {
    /* preference is best-effort; sync stays off if we cannot record it */
  }
}
