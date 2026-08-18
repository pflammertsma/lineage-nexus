/**
 * Firestore caps a single document at 1 MiB, and each research session is one
 * document with an unbounded `messages` array. Crossing the cap makes the write
 * fail — and the failure surfaced only as a generic `syncState: 'error'`, so a
 * user would keep researching, believing their work was backed up, while nothing
 * new reached the cloud.
 *
 * These helpers let the caller check *before* writing, so the failure can be
 * reported honestly and specifically instead of being swallowed.
 */

/** Firestore's hard per-document limit. */
export const FIRESTORE_DOC_LIMIT = 1_048_576;

/**
 * The size we refuse to exceed. Below the hard limit because Firestore counts
 * more than the JSON we measure: field names, per-field type overhead, the
 * document path, and index entries. The margin absorbs that without needing to
 * replicate their exact accounting.
 */
export const SESSION_SIZE_BUDGET = 900_000;

/** Byte length of the payload as actually serialised, not character count. */
export function estimateSessionSize(payload) {
  try {
    return new TextEncoder().encode(JSON.stringify(payload)).length;
  } catch {
    // Circular or otherwise unserialisable: treat as too large rather than
    // letting it through to fail opaquely at the network layer.
    return Number.POSITIVE_INFINITY;
  }
}

export function isSessionTooLarge(payload) {
  return estimateSessionSize(payload) > SESSION_SIZE_BUDGET;
}

/** Human-readable size for a message the user will actually read. */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'too large';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
