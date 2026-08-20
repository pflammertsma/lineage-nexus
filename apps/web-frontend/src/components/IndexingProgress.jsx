import React from 'react';
import { Layers, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getArchiveName } from '../config';

/**
 * How long everything must be frozen before it is worth mentioning.
 *
 * "Frozen" means all three signals at once: no documents indexed, no tasks
 * completed, *and* no movement in the engine's own batch progress. Watching
 * documents alone cried stall over healthy work — a re-ingest updates records in
 * place, so the count legitimately sits still for hours while a batch grinds
 * through its steps at 98 MB/s.
 *
 * Still not proof of a fault: a large merge is quiet under all three. The
 * threshold sits above a healthy batch so a warning means "longer than the ones
 * before it", not "still working".
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

/** When a batch ran, in the reader's own timezone. */
function stamp(value) {
  if (!value) return '';
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return '';
  return when.toLocaleString([], {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
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
  const job = indexing.current_ingest;

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
          <p
            className="text-[10px] uppercase tracking-widest text-secondary/70 mb-1 cursor-help"
            title={'Records searchable right now. Re-harvesting an archive rewrites existing ' +
                   'records under the same ids, so this figure stays put even while the run ' +
                   'is doing real work — it only climbs when genuinely new records arrive.'}
          >
            Searchable
          </p>
          <p className="font-serif text-2xl text-primary leading-none">
            {(indexing.documents ?? 0).toLocaleString()}
          </p>
        </div>
        <div>
          <p
            className="text-[10px] uppercase tracking-widest text-secondary/70 mb-1 cursor-help"
            title={'One task is one submission of up to 10,000 records. The engine groups ' +
                   'whatever is queued into a batch when it goes idle, so batches have no ' +
                   'fixed size or number. This figure is capped by backpressure — it is the ' +
                   'work in flight, not the work remaining.'}
          >
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

      {/* Stage 1: Active Harvester Streaming Banner */}
      {job && job.is_active !== false && (
        <div className="bg-muted/40 border border-border/60 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-primary">
                {getArchiveName(job.archive)}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-card border border-border text-[10px] font-mono font-bold text-accent">
                {job.archive}.{job.kind}
              </span>
              <span className="text-xs text-secondary">
                · File {job.files_completed + 1}
                {job.files_total ? ` of ${job.files_total}` : ''}
              </span>
            </div>
            {Number.isFinite(job.rows_per_second) && (
              <span className="text-xs font-mono font-semibold text-green-600">
                {Math.round(job.rows_per_second).toLocaleString()} rows/s
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 text-xs text-secondary flex-wrap">
            <span>
              {Number.isFinite(job.submitted)
                ? `${job.submitted.toLocaleString()} rows streamed & parsed`
                : 'Streaming S3 bulk export...'}
            </span>
            {indexing.eta_seconds != null && (
              <span className="font-medium text-accent">
                ETA: ~{formatDuration(indexing.eta_seconds)}
              </span>
            )}
          </div>

          {job.waiting_for_queue && (
            <p className="text-[10px] text-amber-500 mt-2 font-medium">
              Throttled by backpressure — harvester is waiting for queue to drain to preserve RAM.
            </p>
          )}
        </div>
      )}

      {/* Stage 2: In-Flight Engine Batch */}
      {batch && (
        <div className="border border-border/60 rounded-lg p-4 mb-4">
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
            <span className="text-xs text-primary font-semibold flex items-center gap-2 flex-wrap">
              <span>Batch {batch.uid}</span>
              {job?.archive && (
                <span className="px-1.5 py-0.5 rounded bg-card border border-border text-[10px] font-mono font-medium text-primary">
                  {getArchiveName(job.archive)} ({job.archive}.{job.kind})
                </span>
              )}
              {busy && (
                <span className="px-1.5 py-0.5 rounded bg-accent/10 border border-accent/30 text-[10px] font-medium text-accent">
                  Indexing
                </span>
              )}
            </span>
            <span className="text-[11px] text-secondary tabular-nums">
              {batch.tasks?.toLocaleString()} tasks ·{' '}
              {batch.documents?.toLocaleString()} docs ·{' '}
              {formatDuration(batch.elapsed_seconds)}
              {indexing.eta_seconds != null ? (
                <span className="text-accent font-medium ml-1">
                  · ETA ~{formatDuration(indexing.eta_seconds)}
                </span>
              ) : (
                indexing.recent_batches?.length > 0 && (
                  <span className="text-accent/80 font-medium ml-1" title="Estimated based on average duration of recent completed batches">
                    · Est. ~{formatDuration(Math.max(0, (indexing.recent_batches.reduce((acc, b) => acc + (parseIsoDuration(b.duration) || 120), 0) / indexing.recent_batches.length) - (batch.elapsed_seconds || 0)))}
                  </span>
                )
              )}
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
          <p className="text-[11px] text-secondary tabular-nums mb-3">
            {pct === null ? 'progress unreported' : `${pct.toFixed(1)}%`}
          </p>

          {/* Engine internal step counters (preserving exact engine terminology) */}
          {batch.steps?.length > 0 && (
            <ul className="space-y-1">
              {batch.steps.map((s, i) => (
                <li key={i} className="flex justify-between gap-3 text-[11px]">
                  <span
                    className={i === batch.steps.length - 1 ? 'text-primary font-medium' : 'text-secondary'}
                    style={{ paddingLeft: `${i * 0.85}rem` }}
                  >
                    {i > 0 && <span className="text-secondary/40 mr-1.5">└</span>}
                    {s.step}
                  </span>
                  <span
                    className={`tabular-nums shrink-0 ${
                      i === batch.steps.length - 1 ? 'text-primary font-medium' : 'text-secondary/70'
                    }`}
                  >
                    {s.finished}/{s.total}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {busy && !job && (
            <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-2 text-xs text-secondary">
              <Loader2 size={13} className="animate-spin text-accent shrink-0" />
              <span>
                Engine is actively crunching word proximity matrices in memory.
              </span>
            </div>
          )}
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
            Nothing has moved in {formatDuration(stalled)} — no documents
            indexed, no tasks completed, and no batch progress.
            {' '}
            <span className="text-secondary">
              A large merge is quiet under all three, so this is only a problem
              if it runs well past how long the batches below took.
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
              // Measured from the documents the engine reports, not inferred
              // from task count times our ingest's batch size.
              const perSecond =
                seconds && seconds > 0 && b.documents ? b.documents / seconds : null;
              return (
                <li key={b.uid} className="flex justify-between gap-3 text-[11px]">
                  <span className="text-secondary">
                    Batch {b.uid}
                    <span className="text-secondary/60"> · {b.tasks?.toLocaleString()} tasks</span>
                  </span>
                  <span className="text-secondary/70 shrink-0 tabular-nums">
                    {stamp(b.started_at || b.finished_at)}
                    {seconds === null ? '' : ` · ${formatDuration(seconds)}`}
                    {perSecond ? ` · ${Math.round(perSecond).toLocaleString()}/s` : ''}
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
