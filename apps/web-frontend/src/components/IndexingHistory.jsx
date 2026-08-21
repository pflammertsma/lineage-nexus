import React, { useEffect } from 'react';
import { History, X, AlertTriangle, CheckCircle2, Clock, Activity, ArrowRight } from 'lucide-react';
import { stamp, formatDuration, parseIsoDuration } from '../utils/formatters';

export const IndexingHistory = ({ isOpen, onClose, recentBatches = [], onOpenTelemetry }) => {
  // Prevent background page scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1500] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border/80 bg-surface">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center text-accent shrink-0">
              <History size={17} />
            </div>
            <div>
              <h3 className="text-base font-bold text-primary flex items-center gap-2">
                <span>Indexing History</span>
                <span className="px-2 py-0.5 rounded-full bg-muted border border-border text-xs font-semibold text-secondary">
                  {recentBatches.length} batch{recentBatches.length === 1 ? '' : 'es'}
                </span>
              </h3>
              <p className="text-xs text-secondary/80">
                Log of all completed archival ingestion & engine indexing batches
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-secondary hover:text-primary hover:bg-muted transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body with Scrollable Batch Items */}
        <div className="p-6 overflow-y-auto space-y-3 max-h-[calc(85vh-5rem)]">
          {recentBatches.length > 0 ? (
            recentBatches.map((b) => {
              const seconds = parseIsoDuration(b.duration);
              const perSecond = seconds && seconds > 0 && b.documents ? b.documents / seconds : null;
              const isFailed = b.status === 'failed' || b.status === 'partiallyFailed' || !!b.error_code || !!b.error_message;

              return (
                <div
                  key={b.uid}
                  className="rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 hover:border-accent/30 transition-all duration-150 p-4 space-y-2.5 shadow-2xs group"
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    {/* Left: Batch ID & Badges */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <div className="flex items-center gap-1.5 font-bold text-sm text-primary">
                        {isFailed ? (
                          <AlertTriangle size={15} className="text-red-400 shrink-0" />
                        ) : (
                          <CheckCircle2 size={15} className="text-green-500 shrink-0" />
                        )}
                        <span>Batch {b.uid}</span>
                      </div>

                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-muted/80 border border-border/40 text-secondary">
                        {b.tasks?.toLocaleString()} task{b.tasks === 1 ? '' : 's'}
                      </span>

                      {b.documents > 0 && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-accent/10 border border-accent/20 text-accent">
                          {b.documents.toLocaleString()} docs
                        </span>
                      )}

                      {isFailed && (
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 rounded flex items-center gap-1">
                          <AlertTriangle size={10} />
                          {b.status === 'partiallyFailed' ? 'Partially Failed' : 'Failed'}
                        </span>
                      )}
                    </div>

                    {/* Right: Metrics, Timestamp & Action */}
                    <div className="flex items-center gap-3 text-xs text-secondary flex-wrap">
                      {perSecond && (
                        <span className="text-green-500 font-semibold flex items-center gap-1">
                          <Activity size={12} className="shrink-0" />
                          <span>{Math.round(perSecond).toLocaleString()}/s</span>
                        </span>
                      )}

                      {seconds !== null && (
                        <span className="text-secondary/80 font-medium">
                          {formatDuration(seconds)}
                        </span>
                      )}

                      <span className="text-secondary/60 flex items-center gap-1 text-[11px]">
                        <Clock size={11} className="shrink-0" />
                        <span>{stamp(b.started_at || b.finished_at)}</span>
                      </span>

                      {onOpenTelemetry && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenTelemetry(b.uid);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-accent/10 hover:bg-accent text-accent hover:text-on-accent text-xs font-bold transition-all cursor-pointer shadow-2xs flex items-center gap-1 group-hover:translate-x-0.5"
                          title={`View telemetry charts for Batch #${b.uid}`}
                        >
                          <span>Telemetry</span>
                          <ArrowRight size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Error Details Banner */}
                  {isFailed && (b.error_message || b.error_code) && (
                    <div className="p-2.5 rounded-lg bg-red-950/20 border border-red-500/20 text-xs">
                      <span className="text-red-400 font-bold mr-2">{b.error_code || 'Error'}:</span>
                      <span className="text-primary/90">{b.error_message || 'Batch encountered execution errors.'}</span>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-secondary">
              <History size={24} className="mx-auto mb-2 text-secondary/40" />
              <p className="text-sm font-medium">No completed batches recorded yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default IndexingHistory;
