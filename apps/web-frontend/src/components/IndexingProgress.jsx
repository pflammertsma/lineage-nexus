import React, { useState } from 'react';
import { Layers, Loader2, AlertTriangle, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import { getArchiveName, ADMIN_API_BASE_URL } from '../config';

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
const IndexingProgress = ({ indexing, onOpenTelemetry, getIdToken, onRefresh }) => {
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelFeedback, setCancelFeedback] = useState(null);
  const [showFailedDetails, setShowFailedDetails] = useState(false);
  const [loadingFailedTasks, setLoadingFailedTasks] = useState(false);
  const [clearingFailed, setClearingFailed] = useState(false);
  const [failedTasks, setFailedTasks] = useState(null);

  const fetchFailedTasks = async () => {
    if (showFailedDetails) {
      setShowFailedDetails(false);
      return;
    }
    setLoadingFailedTasks(true);
    try {
      const token = getIdToken ? await getIdToken() : null;
      const res = await fetch(`${ADMIN_API_BASE_URL}/api/v1/admin/indexing/failed_tasks?limit=20`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.status === 'success') {
        setFailedTasks(data.tasks || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingFailedTasks(false);
      setShowFailedDetails(true);
    }
  };

  const handleClearFailedTasks = async () => {
    setClearingFailed(true);
    try {
      const token = getIdToken ? await getIdToken() : null;
      const res = await fetch(`${ADMIN_API_BASE_URL}/api/v1/admin/indexing/clear_failed_tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (data.status === 'success') {
        setShowFailedDetails(false);
        setFailedTasks([]);
        onRefresh?.();
      } else {
        alert(data.error_message || 'Failed to clear failed task history.');
      }
    } catch (err) {
      alert(String(err));
    } finally {
      setClearingFailed(false);
    }
  };

  const handleCancelIndexing = async () => {
    setCancelling(true);
    setCancelFeedback(null);
    try {
      const token = getIdToken ? await getIdToken() : null;
      const res = await fetch(`${ADMIN_API_BASE_URL}/api/v1/admin/indexing/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (data.status === 'success') {
        setCancelFeedback({ type: 'success', text: 'Indexing cancellation request submitted to Meilisearch engine.' });
        onRefresh?.();
      } else {
        setCancelFeedback({ type: 'error', text: data.error_message || 'Failed to submit cancellation request.' });
      }
    } catch (err) {
      setCancelFeedback({ type: 'error', text: String(err) });
    } finally {
      setCancelling(false);
      setConfirmCancelOpen(false);
    }
  };

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

  const job = indexing.current_ingest;

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      {cancelFeedback && (
        <div className={`p-3 rounded-lg mb-4 text-xs flex items-center justify-between gap-2 border ${cancelFeedback.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}>
          <span>{cancelFeedback.text}</span>
          <button type="button" onClick={() => setCancelFeedback(null)} className="hover:opacity-80 cursor-pointer font-bold px-1">✕</button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-secondary" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-secondary">
            Indexing
          </span>
        </div>
        <div className="flex items-center gap-3">
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

          {busy && (
            <button
              type="button"
              onClick={() => setConfirmCancelOpen(true)}
              className="px-2.5 py-1 text-[11px] font-medium text-red-400 bg-red-500/10 border border-red-500/30 rounded-md hover:bg-red-500/20 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Cancel all active and queued Meilisearch indexing tasks"
            >
              <XCircle size={13} />
              Cancel
            </button>
          )}
        </div>
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
        <div className="mb-4">
          <button
            type="button"
            onClick={fetchFailedTasks}
            className="flex items-center gap-2 text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer font-medium"
          >
            <AlertTriangle size={13} className="shrink-0" />
            <span>
              {queue.failed.toLocaleString()} task{queue.failed === 1 ? '' : 's'} failed — click for details
            </span>
            {loadingFailedTasks && <Loader2 size={11} className="animate-spin ml-1" />}
          </button>

          {showFailedDetails && (
            <div className="mt-2.5 p-3 rounded-lg bg-red-950/20 border border-red-500/30 space-y-2 text-xs animate-in fade-in duration-150">
              <div className="flex items-center justify-between font-semibold text-red-400 text-[11px] uppercase tracking-wider">
                <span>Failed Indexing Tasks</span>
                <div className="flex items-center gap-3">
                  <span>Showing up to {failedTasks?.length || 0}</span>
                  <button
                    type="button"
                    onClick={handleClearFailedTasks}
                    disabled={clearingFailed}
                    className="px-2 py-0.5 rounded text-[10px] text-red-300 hover:text-red-100 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 transition-colors flex items-center gap-1 cursor-pointer font-medium"
                    title="Clear all failed task records from Meilisearch history"
                  >
                    {clearingFailed ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                    Clear History
                  </button>
                </div>
              </div>
              {failedTasks && failedTasks.length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {failedTasks.map((t) => (
                    <div key={t.uid} className="p-2 rounded bg-card/90 border border-red-500/20 text-xs space-y-1">
                      <div className="flex items-center justify-between text-secondary font-mono text-[11px]">
                        <span>Task #{t.uid} ({t.index_uid || 'records'})</span>
                        {t.error_code && <span className="text-red-400 font-bold">{t.error_code}</span>}
                      </div>
                      <p className="text-primary text-xs leading-snug">{t.error_message || 'No detailed error message returned by engine.'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-secondary text-xs italic">No detailed error records returned from engine queue.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stage 1: Active Harvester Streaming Banner */}
      {job && busy && job.is_active !== false && (
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
                · File {Math.min(job.files_completed + 1, job.files_total || 1)}
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
                ? `${job.submitted.toLocaleString()} rows`
                : 'Fetching export…'}
            </span>
            {indexing.eta_seconds != null && (
              <button
                type="button"
                onClick={() => onOpenTelemetry?.(batch?.uid || 'all')}
                className="font-medium text-accent hover:underline cursor-pointer transition-colors flex items-center gap-1"
                title="View batch telemetry charts"
              >
                ETA: ~{formatDuration(indexing.eta_seconds)}
              </button>
            )}
          </div>

          {job.waiting_for_queue && (
            <p
              className="text-[10px] text-amber-500 mt-2 font-medium cursor-help"
              title="The harvester pauses while the engine catches up, so no batch grows larger than memory allows."
            >
              Throttled
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
              {/* No archive chip and no "Indexing" badge: the header above
                  already names the file, and the panel header already says
                  whether the engine is working. */}
            </span>
            <span className="text-[11px] text-secondary tabular-nums">
              {batch.tasks?.toLocaleString()} tasks ·{' '}
              {batch.documents ? `${batch.documents.toLocaleString()} docs · ` : ''}
              {formatDuration(batch.elapsed_seconds)}
              {batch.is_indeterminate ? null : indexing.eta_seconds != null ? (
                <button
                  type="button"
                  onClick={() => onOpenTelemetry?.(batch.uid)}
                  className="text-accent font-medium hover:underline ml-1 cursor-pointer transition-colors inline-flex items-center gap-1"
                  title="View batch telemetry charts"
                >
                  · ETA ~{formatDuration(indexing.eta_seconds)}
                </button>
              ) : null}
            </span>
          </div>

          {(() => {
            const isIndeterminate = batch.is_indeterminate || (batch.virtual_percentage === undefined && batch.percentage === null);
            const virtualPct = batch.virtual_percentage ?? batch.percentage;
            const rawPct = batch.percentage;
            return (
              <>
                <div aria-hidden="true" className="h-1.5 rounded-full bg-muted overflow-hidden mb-1">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isIndeterminate
                      ? 'bg-accent/80 animate-pulse w-full'
                      : stallLevel === 'alert'
                        ? 'bg-red-500'
                        : stallLevel === 'warn'
                          ? 'bg-amber-500'
                          : 'bg-accent'
                      }`}
                    style={isIndeterminate ? {} : { width: `${Math.min(100, Math.max(0, virtualPct ?? 0))}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-secondary tabular-nums mb-3">
                  <span
                    className={rawPct != null && rawPct !== virtualPct ? 'cursor-help' : undefined}
                    title={rawPct != null && rawPct !== virtualPct
                      ? `${rawPct.toFixed(1)}% by the engine's own step counters, reweighted by how long each phase usually takes`
                      : undefined}
                  >
                    {isIndeterminate
                      ? 'Settings rebuild — no progress reported'
                      : virtualPct === null
                        ? 'progress unreported'
                        : `${virtualPct.toFixed(1)}%`}
                  </span>
                </div>
              </>
            );
          })()}

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
                    className={`tabular-nums shrink-0 ${i === batch.steps.length - 1 ? 'text-primary font-medium' : 'text-secondary/70'
                      }`}
                  >
                    {s.finished}/{s.total}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {busy && (
            <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between gap-3 text-xs text-secondary flex-wrap">
              <span className="flex items-center gap-2">
                <Loader2 size={13} className="animate-spin text-accent shrink-0" />
                <span>
                  {batch.sub_step_details?.summary || 'Working'}
                </span>
              </span>
              {batch.sub_step_details?.read_mbs > 0 && (
                <span className="text-[10px] font-mono text-secondary/70">
                  I/O: {batch.sub_step_details.read_mbs.toFixed(1)} MB/s r
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {stallLevel && (
        <div
          className={`flex items-start gap-2.5 rounded-lg p-3 mb-4 border ${stallLevel === 'alert'
            ? 'border-red-500/40 text-red-500'
            : 'border-amber-500/40 text-amber-500'
            }`}
        >
          <AlertTriangle size={16} />
          <p className="text-xs">
            Stalled for {formatDuration(stalled)} without progress.
            {' '}
            <span className="text-secondary">
              Monitor system load; if the system I/O is idle the task may have crashed.
            </span>
          </p>
        </div>
      )}

      {indexing.recent_batches?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-secondary/70 mb-2">
            Recently completed
          </p>
          <ul className="space-y-1.5">
            {indexing.recent_batches.map((b) => {
              const seconds = parseIsoDuration(b.duration);
              const perSecond =
                seconds && seconds > 0 && b.documents ? b.documents / seconds : null;
              const isFailed = b.status === 'failed' || b.status === 'partiallyFailed' || !!b.error_code || !!b.error_message;

              return (
                <li key={b.uid} className="rounded-md border border-transparent hover:border-border/40 transition-colors p-1">
                  <button
                    type="button"
                    onClick={() => onOpenTelemetry?.(b.uid)}
                    className="w-full flex justify-between gap-3 text-[11px] p-1 rounded hover:bg-accent/10 transition-colors cursor-pointer text-left group items-center"
                    title={`Click to view telemetry & charts for Batch ${b.uid}`}
                  >
                    <span className="text-secondary group-hover:text-primary font-medium transition-colors flex items-center gap-2 flex-wrap">
                      <span>Batch {b.uid}</span>
                      <span className="text-secondary/60">· {b.tasks?.toLocaleString()} tasks</span>
                      {isFailed && (
                        <span className="px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 rounded flex items-center gap-1">
                          <AlertTriangle size={9} />
                          {b.status === 'partiallyFailed' ? 'Partially Failed' : 'Failed'}
                        </span>
                      )}
                    </span>
                    <span className="text-secondary/70 group-hover:text-accent shrink-0 tabular-nums font-mono transition-colors">
                      {stamp(b.started_at || b.finished_at)}
                      {seconds === null ? '' : ` · ${formatDuration(seconds)}`}
                      {perSecond ? ` · ${Math.round(perSecond).toLocaleString()}/s` : ''}
                    </span>
                  </button>
                  {isFailed && (b.error_message || b.error_code) && (
                    <div className="mx-1.5 mb-1 mt-0.5 p-2 rounded bg-red-950/20 border border-red-500/20 text-[11px]">
                      <span className="text-red-400 font-bold font-mono mr-2">{b.error_code || 'Error'}:</span>
                      <span className="text-primary/90">{b.error_message || 'Batch encountered execution errors.'}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {confirmCancelOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
        <div className="bg-card border border-border rounded-xl p-5 max-w-md w-full shadow-2xl space-y-4">
          <div className="flex items-center gap-3 text-red-400">
            <AlertTriangle size={20} className="shrink-0 text-red-400" />
            <h3 className="text-sm font-bold text-primary">Cancel Active Indexing?</h3>
          </div>
          <p className="text-xs text-secondary leading-relaxed">
            Are you sure you want to cancel all enqueued and currently processing tasks in Meilisearch?
            Active batch processing will be aborted by the engine.
          </p>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setConfirmCancelOpen(false)}
              disabled={cancelling}
              className="px-3 py-1.5 text-xs text-secondary hover:text-primary transition-colors cursor-pointer"
            >
              Keep Indexing
            </button>
            <button
              type="button"
              onClick={handleCancelIndexing}
              disabled={cancelling}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors cursor-pointer flex items-center gap-2"
            >
              {cancelling && <Loader2 size={13} className="animate-spin" />}
              {cancelling ? 'Cancelling...' : 'Yes, cancel indexing'}
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};

export default IndexingProgress;
