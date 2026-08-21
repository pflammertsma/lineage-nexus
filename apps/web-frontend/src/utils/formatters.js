/**
 * Unified formatting utilities for dates, durations, and telemetry across the web frontend.
 */

/**
 * Formats duration in seconds into a human-readable string (e.g., '45s', '3m 12s', '1h 45m', '2d 4h').
 */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${Math.round(seconds % 60)}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

/**
 * Formats a timestamp into relative time (e.g. 'Just now', '5m ago', '2h ago', '3d ago').
 */
export function formatAgo(timestamp) {
  if (!timestamp) return '—';
  const when = new Date(timestamp);
  const diffSec = Math.floor((Date.now() - when.getTime()) / 1000);
  if (Number.isNaN(diffSec) || diffSec < 0) return '—';
  if (diffSec < 60) return 'Just now';
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/**
 * Formats an ISO date/timestamp into a localized date-time string (e.g. '21 Aug, 16:45:00').
 */
export function stamp(value) {
  if (!value) return '';
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return '';
  return when.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Parses Meilisearch ISO 8601 duration strings (e.g., 'PT189.380307315S') into numeric seconds.
 */
export function parseIsoDuration(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'number') return value;
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/);
  if (!match) return null;
  return (+match[1] || 0) * 3600 + (+match[2] || 0) * 60 + (+match[3] || 0);
}
