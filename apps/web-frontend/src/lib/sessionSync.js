/**
 * Shape of a session in Firestore.
 *
 *   users/{uid}/sessions/{id}              metadata only — title, updatedAt, messageCount
 *   users/{uid}/sessions/{id}/messages/{n} one document per message
 *
 * The previous design put the whole `messages` array in the session document,
 * which caused three separate problems:
 *
 *   - a hard 1 MiB ceiling, past which writes failed and the failure surfaced
 *     only as a vague "sync error" while the user kept researching;
 *   - appending one message rewrote the entire history, so a long session cost
 *     hundreds of kilobytes per turn;
 *   - every snapshot shipped the whole document to every device, and two devices
 *     editing one session clobbered each other wholesale.
 *
 * Splitting messages into their own documents fixes all three: writes are small
 * and additive, snapshots carry only what changed, and concurrent edits touch
 * different documents so they merge instead of colliding.
 *
 * These helpers are pure so they can be tested without a Firestore connection.
 */

/** Wide enough to order a conversation far longer than anyone will hold. */
const SEQ_WIDTH = 6;

/**
 * Document id for a message.
 *
 * Zero-padded so lexicographic id order matches numeric order, and *derived from
 * the index* rather than random: rewriting message 3 overwrites message 3 instead
 * of appending a duplicate, which makes a retried push idempotent.
 */
export function messageDocId(seq) {
  return String(seq).padStart(SEQ_WIDTH, '0');
}

/** The session document itself — small, fixed size, safe to rewrite often. */
export function sessionMetaDoc(session, updatedAt) {
  return {
    id: session.id,
    title: session.title || 'Untitled research',
    updatedAt,
    messageCount: (session.messages || []).length,
  };
}

/**
 * The messages that exist locally but have not been written yet.
 *
 * Compares against a count rather than diffing content: messages are only ever
 * appended, so anything at or beyond the pushed count is new. A message edited
 * in place would be missed, which the app never does.
 */
export function pendingMessageDocs(session, pushedCount = 0) {
  const messages = session.messages || [];
  const out = [];
  for (let seq = pushedCount; seq < messages.length; seq++) {
    const message = messages[seq];
    if (!message) continue;
    const data = {
      seq,
      role: message.role || 'model',
      content: message.content || '',
      createdAt: message.createdAt || Date.now(),
    };
    // Only carry the optional fields when present, so absent ones do not become
    // nulls that later read back as content.
    if (Array.isArray(message.steps) && message.steps.length) data.steps = message.steps;
    if (message.retry) data.retry = true;
    out.push({ id: messageDocId(seq), data });
  }
  return out;
}

/** Rebuilds a message array from message documents, ordered and gap-free. */
export function messagesFromDocs(docs) {
  const bySeq = new Map();
  for (const doc of docs) {
    if (!doc || typeof doc.seq !== 'number') continue;
    const { seq, ...rest } = doc;
    bySeq.set(seq, rest);
  }
  // A gap means a message failed to write; stopping at it is better than
  // rendering a conversation with a hole silently closed up.
  const ordered = [];
  for (let seq = 0; bySeq.has(seq); seq++) ordered.push(bySeq.get(seq));
  return ordered;
}

/**
 * Folds remote session metadata into the local list.
 *
 * Only metadata: messages are synced per session by their own listener, so a
 * session arriving from another device appears in the sidebar immediately and
 * fills in when opened. `pushedAt` distinguishes our own echo from a genuinely
 * newer edit elsewhere.
 */
export function mergeSessionMeta(local, remoteMeta, pushedAt = {}) {
  const byId = new Map(local.map((s) => [s.id, s]));

  for (const meta of remoteMeta) {
    if (!meta?.id) continue;
    const mine = byId.get(meta.id);

    if (!mine) {
      byId.set(meta.id, {
        id: meta.id,
        title: meta.title || 'Untitled research',
        updatedAt: meta.updatedAt || 0,
        messageCount: meta.messageCount || 0,
        messages: [],
      });
      continue;
    }

    // Our own write coming back: keep local, which may already be further ahead.
    const isOwnEcho = pushedAt[meta.id] && meta.updatedAt <= pushedAt[meta.id];
    if (isOwnEcho) continue;

    if ((meta.updatedAt || 0) > (mine.updatedAt || 0)) {
      byId.set(meta.id, {
        ...mine,
        title: meta.title || mine.title,
        updatedAt: meta.updatedAt,
        messageCount: meta.messageCount ?? mine.messageCount,
      });
    }
  }

  // Deleted elsewhere: absent remotely, and we did not just create it locally.
  const remoteIds = new Set(remoteMeta.map((m) => m?.id).filter(Boolean));
  for (const [id, session] of [...byId]) {
    const neverSynced = !pushedAt[id] && !session.updatedAt;
    if (!remoteIds.has(id) && !neverSynced) byId.delete(id);
  }

  return [...byId.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/** True when a session document still carries the old inline array. */
export function isLegacySession(doc) {
  return Boolean(doc && Array.isArray(doc.messages) && doc.messages.length > 0);
}
