// Merge rules for the local-first mirror.
//
// The device's localStorage is the working copy; Firestore is a mirror that other
// devices also write to. When a remote snapshot arrives we have to decide, per
// session, whether the local or the remote copy wins.
//
// `pushedAt` is a map of {sessionId: timestamp} recording when THIS device last
// pushed each session. A remote copy is only adopted when it is strictly newer
// than what we last sent — otherwise the echo of our own write would clobber
// edits the user made in the meantime.
//
// Deletions are never inferred from absence. A session missing from the remote
// snapshot may simply never have been pushed (created offline, or before sync was
// switched on), so dropping it would silently destroy research. Deletes are always
// explicit, via deleteSession / deleteAllData.

export function mergeSessions(local = [], remote = [], pushedAt = {}) {
  const byId = new Map();
  const order = [];

  const remember = (session) => {
    if (!session || !session.id) return;
    if (!byId.has(session.id)) order.push(session.id);
    byId.set(session.id, session);
  };

  local.forEach(remember);

  for (const remoteSession of remote) {
    if (!remoteSession || !remoteSession.id) continue;
    const localSession = byId.get(remoteSession.id);

    if (!localSession) {
      // Only on another device so far — adopt it.
      remember(remoteSession);
      continue;
    }

    const lastPush = pushedAt[remoteSession.id] || 0;
    const remoteAt = remoteSession.updatedAt || 0;

    // Strictly newer than our last push means another device moved it forward.
    if (remoteAt > lastPush) remember(remoteSession);
  }

  return order.map(id => byId.get(id));
}

// Stable content signature, used to decide whether a session actually changed and
// needs pushing. Deliberately ignores updatedAt so that re-stamping a timestamp
// does not by itself look like a change and cause a write loop.
export function sessionFingerprint(session) {
  return JSON.stringify({
    title: session.title,
    messages: session.messages || [],
  });
}
