import React from 'react';
import { Layers, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';

/**
 * A batch whose document count has not moved for this long is worth a look.
 *
 * Not an error: a large merge reports no change until it commits, so silence is
 * normal for a while. The threshold is set above the duration of a healthy batch
 * so that a warning means "longer than the ones before it", not "still working".
 */
const STALL_WARN_SECONDS = 300;
const STALL_ALERT_SECONDS = 900;

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${Math.round(seconds % 60)}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** Meilisearch reports batch durations as ISO 8601, e.g. `PT189.380307315S`. */
function parseIsoDuration(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/);
  if (!match) return null;
  return (+match[1] || 0) * 3600 + (+match[2] || 0) * 60 + (+match[3] || 0);
}

/**
 * How the harvest is actually going.
 *
 * The count on the coverage panel is what is *searchable*; documents accepted by
 * the engine but not yet merged are invisible there, and the gap between the two
 * can be hours wide. Without this panel a stalled harvest and a finished one look
 * exactly the same from the dashboard.
 */
const IndexingProgress = ({ indexing }) => {
  if (!indexing) {
    return (
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-2 text-xs text-secondary">
          <Loader2 size={13} className="animate-spin" />
          Reading indexing state…
        </div>
      </div>
    );
  }

  if (indexing.status === 'error') {
    return (
      <div className="bg-card border border-amber-500/40 rounded-lg p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-secondary">{indexing.error_message}</p>
        </div>
      </div>
    );
  }

  const batch = indexing.current_batch;
  const queue = indexing.queue || {};
  const pending = queue.total_pending || 0;
  const busy = indexing.is_indexing || pending > 0;
  const stalled = indexing.stalled_seconds;

  // Only meaningful while something is in flight — a count that has not changed
  // because the queue is empty is not a stall, it is an idle index.
  const stallLevel =
    busy && Number.isFinite(stalled)
      ? stalled >= STALL_ALERT_SECONDS
        ? 'alert'
        : stalled >= STALL_WARN_SECONDS
          ? 'warn'
          : null
      : null;

  const pct = Number.isFinite(batch?.percentage) ? batch.percentage : null;

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-secondary" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-secondary">
            Indexing
          </span>
        </div>
        <span className="flex items-center gap-1.5 text-[11px]">
          {busy ? (
            <>
              <Loader2 size={12} className="animate-spin text-accent" />
              <span className="text-accent">Working</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={12} className="text-green-600" />
              <span className="text-green-600">Idle — queue empty</span>
            </>
          )}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-5">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-secondary/70 mb-1">
            Searchable
          </p>
          <p className="font-serif text-2xl text-primary leading-none">
            {(indexing.documents ?? 0).toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-secondary/70 mb-1">
            Queued tasks
          </p>
          <p className={`font-serif text-2xl leading-none ${pending ? 'text-amber-500' : 'text-primary'}`}>
            {pending.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-secondary/70 mb-1">
            Rate
          </p>
          {/* An idle index has no rate. Showing 0/s reads as "stopped
              unexpectedly" rather than "nothing to do". */}
          <p className="font-serif text-2xl text-primary leading-none">
            {busy && Number.isFinite(indexing.documents_per_second)
              ? `${Math.round(indexing.documents_per_second).toLocaleString()}/s`
              : '—'}
          </p>
        </div>
      </div>

      {queue.failed > 0 && (
        <p className="flex items-center gap-2 text-xs text-red-500 mb-4">
          <AlertTriangle size={13} className="shrink-0" />
          {queue.failed.toLocaleString()} task{queue.failed === 1 ? '' : 's'} failed — those
          documents are not in the index.
        </p>
      )}

      {batch && (
        <div className="border border-border/60 rounded-lg p-4 mb-4">
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
            <span className="text-xs text-primary font-semibold">
              Batch {batch.uid}
            </span>
            <span className="text-[11px] text-secondary font-mono">
              {batch.tasks?.toLocaleString()} tasks ·{' '}
              {batch.documents?.toLocaleString()} docs ·{' '}
              {formatDuration(batch.elapsed_seconds)}
            </span>
          </div>

          <div aria-hidden="true" className="h-1.5 rounded-full bg-muted overflow-hidden mb-1">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                stallLevel === 'alert' ? 'bg-red-500' : stallLevel === 'warn' ? 'bg-amber-500' : 'bg-accent'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%` }}
            />
          </div>
          <p className="text-[11px] text-secondary font-mono mb-3">
            {pct === null ? 'progress unreported' : `${pct.toFixed(1)}%`}
          </p>

          {/* The engine's own step counters. When the percentage is not moving,
              this is what shows which phase it is wedged in.

              These are nested, not parallel: each step is a stage *within* the
              one above it, so `processing tasks 0/2` and `payload 911/1121`
              describe the same work at different depths. Rendered flat they read
              as four contradictory progress bars, so the nesting is drawn. */}
          {batch.steps?.length > 0 && (
            <ul className="space-y-1">
              {batch.steps.map((s, i) => (
                <li key={i} className="flex justify-between gap-3 text-[11px]">
                  <span
                    className={i === batch.steps.length - 1 ? 'text-primary' : 'text-secondary'}
                    style={{ paddingLeft: `${i * 0.85}rem` }}
                  >
                    {i > 0 && <span className="text-secondary/40 mr-1.5">└</span>}
                    {s.step}
                  </span>
                  <span
                    className={`font-mono shrink-0 ${
                      i === batch.steps.length - 1 ? 'text-primary' : 'text-secondary/70'
                    }`}
                  >
                    {s.finished}/{s.total}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-secondary/60 mt-2">
            Steps are nested — the deepest is the work happening now. All{' '}
            {batch.tasks?.toLocaleString()} tasks commit together, so the
            searchable count does not move until the whole batch lands.
          </p>
        </div>
      )}

      {stallLevel && (
        <div
          className={`flex items-start gap-2.5 rounded-lg p-3 mb-4 border ${
            stallLevel === 'alert'
              ? 'border-red-500/40 text-red-500'
              : 'border-amber-500/40 text-amber-500'
          }`}
        >
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <p className="text-xs">
            The document count has not moved in {formatDuration(stalled)}.
            {' '}
            <span className="text-secondary">
              A large merge reports nothing until it commits, so this is only a
              problem if it runs well past how long the batches below took.
            </span>
          </p>
        </div>
      )}

      {indexing.recent_batches?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-secondary/70 mb-2">
            Recently completed
          </p>
          <ul className="space-y-1">
            {indexing.recent_batches.map((b) => {
              const seconds = parseIsoDuration(b.duration);
              const perSecond =
                seconds && b.tasks ? (b.tasks * 10000) / seconds : null;
              return (
                <li key={b.uid} className="flex justify-between gap-3 text-[11px]">
                  <span className="text-secondary">
                    Batch {b.uid}
                    <span className="text-secondary/60"> · {b.tasks?.toLocaleString()} tasks</span>
                  </span>
                  <span className="font-mono text-secondary/70 shrink-0">
                    {seconds === null ? '—' : formatDuration(seconds)}
                    {perSecond
                      ? ` · ~${Math.round(perSecond).toLocaleString()}/s`
                      : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default IndexingProgress;
