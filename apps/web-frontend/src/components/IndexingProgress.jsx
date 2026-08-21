import React, { useState } from 'react';
import { Layers, Loader2, AlertTriangle, CheckCircle2, XCircle, Trash2, History } from 'lucide-react';
import { getArchiveName, getKindLabel, ADMIN_API_BASE_URL } from '../config';
import { formatDuration, formatAgo } from '../utils/formatters';
import IndexingHistory from './IndexingHistory';

const STALL_WARN_SECONDS = 300;
const STALL_ALERT_SECONDS = 900;

export const IndexingProgress = ({ indexing, onOpenTelemetry, getIdToken, onRefresh }) => {
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelFeedback, setCancelFeedback] = useState(null);
  const [showFailedDetails, setShowFailedDetails] = useState(false);
  const [loadingFailedTasks, setLoadingFailedTasks] = useState(false);
  const [clearingFailed, setClearingFailed] = useState(false);
  const [failedTasks, setFailedTasks] = useState(null);
  const [showBatchesModal, setShowBatchesModal] = useState(false);

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
        setFailedTasks([]);
        if (onRefresh) onRefresh();
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
        setCancelFeedback({ type: 'success', text: 'All active and queued indexing tasks cancelled.' });
        if (onRefresh) onRefresh();
      } else {
        setCancelFeedback({ type: 'error', text: data.error_message || 'Failed to cancel tasks.' });
      }
    } catch (err) {
      setCancelFeedback({ type: 'error', text: err.message || 'Network error submitting cancellation.' });
    } finally {
      setCancelling(false);
      setConfirmCancelOpen(false);
    }
  };

  if (!indexing) {
    return (
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-2 text-secondary text-xs">
          <Loader2 size={14} className="animate-spin text-accent" />
          <span>Connecting to archival harvester...</span>
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

  const rawBatch = indexing.current_batch;
  const queue = indexing.queue || {};
  const pending = queue.total_pending || 0;
  const job = indexing.current_ingest;
  const busy = Boolean(indexing.is_indexing);
  const batch = rawBatch || (busy ? indexing.recent_batches?.[0] : null);
  const stalled = indexing.stalled_seconds;

  const stallLevel =
    busy && Number.isFinite(stalled) && stalled > 0
      ? stalled >= STALL_ALERT_SECONDS
        ? 'alert'
        : stalled >= STALL_WARN_SECONDS
          ? 'warn'
          : null
      : null;

  const lastIndexTime = indexing.recent_batches?.[0]?.finished_at || indexing.recent_batches?.[0]?.started_at;

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
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1.5 text-[11px] mr-1">
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

          <button
            type="button"
            onClick={() => setShowBatchesModal(true)}
            className="px-2.5 py-1 text-[11px] font-medium text-secondary hover:text-primary bg-muted/60 hover:bg-muted border border-border/60 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
            title="View history of all completed batches"
          >
            <History size={13} />
            <span>Batches ({indexing.recent_batches?.length || 0})</span>
          </button>

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

      <div className="grid gap-4 sm:grid-cols-4 mb-5">
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
          <p className="font-serif text-2xl text-primary leading-none">
            {busy && Number.isFinite(indexing.documents_per_second)
              ? `${Math.round(indexing.documents_per_second).toLocaleString()}/s`
              : '—'}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-secondary/70 mb-1">
            Last index
          </p>
          <p className="font-serif text-2xl text-primary leading-none">
            {busy ? 'In progress' : formatAgo(lastIndexTime)}
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
                      <div className="flex items-center justify-between text-secondary text-[11px]">
                        <span>Engine Task #{t.uid} ({t.index_uid || 'records'})</span>
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

      {/* Stage 1: Active Harvester Streaming / Engine Indexing Banner */}
      {job && busy && job.is_active !== false && job.archive && (
        <div className="bg-muted/40 border border-border/60 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-primary">
                {getArchiveName(job.archive)}
              </span>
              <span className="text-xs text-secondary/70">
                · {job.phase === 'indexing_in_engine'
                    ? 'Payloads submitted — engine building search index'
                    : `Harvesting ${job.kind ? getKindLabel(job.kind) : 'stream'}`}
              </span>
            </div>
            {(job.rows_per_second > 0 || job.speed_mbs > 0) && (
              <span className="text-xs font-medium text-accent">
                {job.rows_per_second ? `${Math.round(job.rows_per_second).toLocaleString()} docs/s` : `${job.speed_mbs.toFixed(1)} MB/s`}
              </span>
            )}
          </div>

          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden mb-2">
            <div
              className={`h-full transition-all duration-300 rounded-full ${job.phase === 'indexing_in_engine' ? 'bg-amber-500 animate-pulse' : 'bg-accent'}`}
              style={{
                width: `${
                  job.files_total > 0
                    ? Math.min(100, Math.max(5, (((job.files_completed || 0) + (job.phase === 'indexing_in_engine' ? 1 : 0.5)) / job.files_total) * 100))
                    : (job.phase === 'indexing_in_engine' ? 100 : 5)
                }%`
              }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-secondary flex-wrap gap-2">
            <span>
              {job.files_total != null && job.files_total > 0 && (
                <span className="font-semibold text-primary mr-1.5">
                  File {Math.min(job.files_total, (job.files_completed || 0) + (job.phase === 'indexing_in_engine' ? 0 : 1))} of {job.files_total} ·
                </span>
              )}
              {job.submitted != null
                ? `${job.submitted.toLocaleString()} records extracted & submitted`
                : (job.phase === 'indexing_in_engine' ? 'Ingestion payloads submitted · Waiting for Meilisearch index build' : 'Streaming harvest files...')}
            </span>
            {job.eta_seconds != null && (
              <span>ETA ~{formatDuration(job.eta_seconds)}</span>
            )}
          </div>
        </div>
      )}

      {/* Stage 2: Active Meilisearch Engine Indexing Progress */}
      {batch && (rawBatch || busy) && (
        <div className="bg-muted/40 border border-border/60 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-primary">
                Batch {batch.uid}
              </span>
              {batch.archive && (
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 border border-amber-500/20 text-amber-500">
                  {getArchiveName(batch.archive)}
                </span>
              )}
            </div>
            <span className="text-xs text-secondary">
              {batch.tasks?.toLocaleString()} tasks · {batch.documents?.toLocaleString()} docs · {formatDuration(batch.elapsed_seconds)}
              {batch.eta_seconds != null && ` · ETA ~${formatDuration(batch.eta_seconds)}`}
            </span>
          </div>

          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden mb-3">
            <div
              className="bg-amber-500 h-full transition-all duration-300 rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, batch.virtual_progress_pct ?? batch.progress_percent ?? 0))}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-secondary mb-2">
            <span className="font-medium text-primary">
              {(batch.virtual_progress_pct ?? batch.progress_percent ?? 0).toFixed(1)}%
            </span>
          </div>

          {batch.steps?.length > 0 && (
            <ul className="space-y-1.5 border-t border-border/40 pt-2.5 my-2">
              {batch.steps.map((s, i) => (
                <li key={i} className="flex items-center justify-between text-xs py-0.5">
                  <span className="flex items-center gap-2">
                    {s.status === 'done' ? (
                      <CheckCircle2 size={13} className="text-green-500 shrink-0" />
                    ) : s.status === 'active' ? (
                      <Loader2 size={13} className="animate-spin text-amber-500 shrink-0" />
                    ) : (
                      <span className="w-3 h-3 rounded-full border border-border/80 shrink-0 inline-block" />
                    )}
                    <span className={s.status === 'done' ? 'text-secondary/70' : s.status === 'active' ? 'text-primary font-semibold' : 'text-secondary/80'}>
                      {s.label || s.step || `Phase ${i + 1}`}
                    </span>
                  </span>
                  <span className={`tabular-nums shrink-0 font-mono text-[11px] ${s.status === 'done' ? 'text-green-500 font-medium' : s.status === 'active' ? 'text-accent font-bold' : 'text-secondary/60'}`}>
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
                  {batch.sub_step_details?.summary || 'Processing in memory...'}
                </span>
              </span>
              {batch.sub_step_details?.read_mbs > 0 && (
                <span className="text-[10px] text-secondary/70">
                  I/O: {batch.sub_step_details.read_mbs.toFixed(1)} MB/s r
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stage 3: Queued Archives Pipeline Banner */}
      {indexing.harvest_queue?.pending?.length > 0 && (
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-3 mb-4 text-xs animate-in fade-in duration-150">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-bold text-accent flex items-center gap-1.5">
              <History size={13} />
              <span>
                {indexing.harvest_queue.pending.length} Archive{indexing.harvest_queue.pending.length === 1 ? '' : 's'} Queued in Pipeline
              </span>
            </span>
            <span className="text-secondary/80">
              Processes automatically after current indexing completes
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {indexing.harvest_queue.pending.map((code, idx) => (
              <span key={code} className="px-2 py-0.5 rounded bg-card border border-border text-[11px] font-medium text-primary flex items-center gap-1 shadow-2xs">
                <span className="text-secondary/60">#{idx + 1}</span>
                <span>{getArchiveName(code)}</span>
              </span>
            ))}
          </div>
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

      <IndexingHistory
        isOpen={showBatchesModal}
        onClose={() => setShowBatchesModal(false)}
        recentBatches={indexing.recent_batches}
        onOpenTelemetry={onOpenTelemetry}
      />

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
