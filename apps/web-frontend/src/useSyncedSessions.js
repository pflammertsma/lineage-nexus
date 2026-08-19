import { useCallback, useEffect, useRef, useState } from 'react';
import { loadFirestore } from './firebase';
import { SESSIONS_STORAGE, SYNC_CONSENT_STORAGE } from './config';
import { sessionFingerprint } from './lib/mergeSessions';
import { estimateSessionSize, formatBytes, isSessionTooLarge } from './lib/sessionSize';
import {
  isLegacySession,
  mergeSessionMeta,
  messagesFromDocs,
  pendingMessageDocs,
  sessionMetaDoc,
} from './lib/sessionSync';

const PUSH_DEBOUNCE_MS = 800;

/** Removes every message document under a session. Firestore has no cascade. */
async function deleteMessagesOf(fs, uid, sessionId) {
  const messages = await fs.getDocs(
    fs.collection(fs.db, 'users', uid, 'sessions', sessionId, 'messages')
  );
  const docs = messages.docs;
  for (let i = 0; i < docs.length; i += 450) {
    const batch = fs.writeBatch(fs.db);
    docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}

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
export default function useSyncedSessions({ uid, syncEnabled, activeSessionId }) {
  const [sessions, setSessions] = useState(loadLocal);
  const [storageError, setStorageError] = useState(null);
  const [syncState, setSyncState] = useState('idle'); // idle | syncing | synced | error

  // {sessionId: timestamp} of what this device last pushed, so a remote echo is
  // distinguishable from another device's newer edit.
  const pushedAtRef = useRef({});
  const fingerprintsRef = useRef({});
  const pushTimerRef = useRef(null);
  // How many messages of each session have been written. Messages are only
  // appended, so this is enough to know what is still pending.
  const pushedCountRef = useRef({});
  const [syncWarning, setSyncWarning] = useState(null);

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
    setSyncState('syncing');

    // The SDK now arrives asynchronously, so the subscription is set up inside an
    // async body. `cancelled` guards the case where the effect is torn down
    // before the import resolves, which would otherwise leak a live listener.
    let unsubscribe = null;
    let cancelled = false;
    (async () => {
      const fs = await loadFirestore();
      if (!fs || cancelled) return;
      unsubscribe = fs.onSnapshot(
        fs.collection(fs.db, 'users', uid, 'sessions'),
        (snapshot) => {
          const remote = snapshot.docs.map(d => d.data());

          // Sessions written by the old schema still carry an inline array.
          // Adopt those messages so nothing is lost, and let the next push
          // rewrite them into the subcollection.
          const legacy = remote.filter(isLegacySession);
          setSessions(local => {
            let next = mergeSessionMeta(local, remote, pushedAtRef.current);
            if (legacy.length) {
              const byId = new Map(next.map(x => [x.id, x]));
              for (const doc of legacy) {
                const mine = byId.get(doc.id);
                if (mine && !mine.messages?.length) {
                  byId.set(doc.id, { ...mine, messages: doc.messages });
                  // Not yet in the subcollection, so the push must write them.
                  pushedCountRef.current[doc.id] = 0;
                  fingerprintsRef.current[doc.id] = null;
                }
              }
              next = [...byId.values()];
            }
            return next;
          });
          setSyncState('synced');
        },
        () => setSyncState('error')
      );
    })();
    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [active, uid]);

  // Pull: messages for the session actually being read.
  //
  // Subscribed per session rather than all at once: a sidebar of fifty
  // conversations would otherwise open fifty listeners and download every
  // message to show one. Snapshots here carry only the documents that changed.
  useEffect(() => {
    if (!active || !activeSessionId) return;
    let unsubscribe = null;
    let cancelled = false;
    (async () => {
      const fs = await loadFirestore();
      if (!fs || cancelled) return;
      unsubscribe = fs.onSnapshot(
        fs.query(
          fs.collection(fs.db, 'users', uid, 'sessions', activeSessionId, 'messages'),
          fs.orderBy('seq'),
        ),
        (snapshot) => {
          const remote = messagesFromDocs(snapshot.docs.map(d => d.data()));
          setSessions(local => local.map(session => {
            if (session.id !== activeSessionId) return session;
            // Never shrink from a snapshot: local may hold a message that has not
            // been written yet, and adopting the shorter remote list would erase
            // what the user just typed.
            if (remote.length <= (session.messages || []).length) return session;
            return { ...session, messages: remote };
          }));
        },
        () => setSyncState('error')
      );
    })();
    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [active, uid, activeSessionId]);

  // Push: mirror locally-changed sessions upward, debounced.
  useEffect(() => {
    if (!active) return;
    clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(async () => {
      const changed = sessions.filter(
        s => s?.id && fingerprintsRef.current[s.id] !== sessionFingerprint(s)
      );
      if (!changed.length) return;

      const fs = await loadFirestore();
      if (!fs) return;

      try {
        await Promise.all(changed.map(async (session) => {
          const updatedAt = Date.now();
          const pushedCount = pushedCountRef.current[session.id] ?? 0;
          const pending = pendingMessageDocs(session, pushedCount);

          // One batch per session: the metadata document and its new messages
          // commit together, so `messageCount` can never advertise messages that
          // are not there.
          const batch = fs.writeBatch(fs.db);
          const sessionRef = fs.doc(fs.db, 'users', uid, 'sessions', session.id);

          // deleteField() is required, not cosmetic: a merge write leaves the old
          // inline `messages` array in place, and the security rules reject a
          // session document that still carries it.
          batch.set(
            sessionRef,
            { ...sessionMetaDoc(session, updatedAt), messages: fs.deleteField() },
            { merge: true }
          );

          // The per-session ceiling is gone, but one document still cannot exceed
          // 1 MiB, so a single enormous message would fail — and Firestore's
          // rejection is indistinguishable from a network error by the time it
          // reaches the catch. Checked here so it can be reported honestly.
          const oversized = pending.find(({ data }) => isSessionTooLarge(data));
          if (oversized) {
            setSyncWarning(
              `One message in "${session.title || 'this research'}" is ` +
              `${formatBytes(estimateSessionSize(oversized.data))} and too large to sync ` +
              `(the limit is 1 MB per message). It is still saved on this device.`
            );
            return;
          }

          for (const { id, data } of pending) {
            batch.set(fs.doc(sessionRef, 'messages', id), data);
          }

          // A batch caps at 500 writes. Splitting keeps a very long first sync
          // (or a legacy migration) from failing wholesale.
          if (pending.length > 400) {
            await fs.setDoc(
              sessionRef,
              { ...sessionMetaDoc(session, updatedAt), messages: fs.deleteField() },
              { merge: true }
            );
            for (let i = 0; i < pending.length; i += 400) {
              const chunk = fs.writeBatch(fs.db);
              for (const { id, data } of pending.slice(i, i + 400)) {
                chunk.set(fs.doc(sessionRef, 'messages', id), data);
              }
              await chunk.commit();
            }
          } else {
            await batch.commit();
          }

          pushedAtRef.current[session.id] = updatedAt;
          pushedCountRef.current[session.id] = (session.messages || []).length;
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
    delete pushedCountRef.current[id];
    if (!active) return;
    const fs = await loadFirestore();
    if (!fs) return;
    try {
      // Firestore does not cascade. Deleting only the parent would leave every
      // message behind — invisible, still stored, and still counted.
      await deleteMessagesOf(fs, uid, id);
      await fs.deleteDoc(fs.doc(fs.db, 'users', uid, 'sessions', id));
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
      const fs = await loadFirestore();
      if (fs) {
        try {
          const snapshot = await fs.getDocs(fs.collection(fs.db, 'users', uid, 'sessions'));
          // Messages first: a session document removed before its subcollection
          // leaves orphans that nothing can reach to delete afterwards.
          for (const d of snapshot.docs) {
            await deleteMessagesOf(fs, uid, d.id);
          }
          // Batches cap at 500 operations.
          const docs = snapshot.docs;
          for (let i = 0; i < docs.length; i += 450) {
            const batch = fs.writeBatch(fs.db);
            docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
          await fs.deleteDoc(fs.doc(fs.db, 'users', uid)).catch(() => {});
        } catch {
          setSyncState('error');
          throw new Error('Could not delete your cloud data. Please try again.');
        }
      }
    }
    pushedAtRef.current = {};
    fingerprintsRef.current = {};
    pushedCountRef.current = {};
    if (scope === 'all') setSessions([]);
  }, [uid]);

  return {
    sessions,
    setSessions,
    deleteSession,
    deleteAllData,
    syncState,
    storageError,
    syncWarning,
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
