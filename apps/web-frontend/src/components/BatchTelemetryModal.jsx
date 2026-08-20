import React, { useState, useEffect, useCallback } from 'react';
import { Download, RefreshCw, BarChart2, X, Activity } from 'lucide-react';
import { ADMIN_API_BASE_URL } from '../config';

export const BatchTelemetryModal = ({ isOpen, onClose, initialBatchUid = 'all', getIdToken }) => {
  const [telemetry, setTelemetry] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBatchUid, setSelectedBatchUid] = useState(initialBatchUid || 'all');

  useEffect(() => {
    if (initialBatchUid) {
      setSelectedBatchUid(String(initialBatchUid));
    }
  }, [initialBatchUid]);

  const fetchTelemetry = useCallback(async () => {
    if (!ADMIN_API_BASE_URL || !isOpen) return;
    setLoading(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch(`${ADMIN_API_BASE_URL}/api/v1/admin/batch-telemetry`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') {
          setTelemetry(data.samples || []);
        }
      }
    } catch {
      // Non-critical debug telemetry
    } finally {
      setLoading(false);
    }
  }, [getIdToken, isOpen]);

  useEffect(() => {
    if (isOpen) {
      fetchTelemetry();
      const interval = setInterval(fetchTelemetry, 10000);
      return () => clearInterval(interval);
    }
  }, [isOpen, fetchTelemetry]);

  // Close on escape key
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

  const handleDownloadJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredSamples, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `batch_telemetry_${selectedBatchUid}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Distinct batch UIDs
  const batchUids = Array.from(new Set(telemetry.map((s) => s.batch_uid).filter(Boolean)));
  const filteredSamples =
    selectedBatchUid === 'all'
      ? telemetry
      : telemetry.filter((s) => String(s.batch_uid) === String(selectedBatchUid));

  // SVGs layout metrics
  const W = 600;
  const H = 180;
  const P = 30;

  const maxElapsed = Math.max(1, ...filteredSamples.map((s) => s.elapsed_seconds || 0));
  const maxEta = Math.max(
    1,
    ...filteredSamples.map((s) => Math.max(s.eta_seconds || 0, s.naive_eta_seconds || 0))
  );

  const getX = (elapsed) => P + ((elapsed || 0) / maxElapsed) * (W - 2 * P);
  const getYPct = (pct) => H - P - ((pct || 0) / 100) * (H - 2 * P);
  const getYEta = (eta) => H - P - ((eta || 0) / maxEta) * (H - 2 * P);

  // SVG Paths
  const rawPath = filteredSamples
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getX(s.elapsed_seconds)} ${getYPct(s.raw_progress_pct)}`)
    .join(' ');

  const virtPath = filteredSamples
    .map(
      (s, i) =>
        `${i === 0 ? 'M' : 'L'} ${getX(s.elapsed_seconds)} ${getYPct(s.virtual_progress_pct)}`
    )
    .join(' ');

  const smoothedEtaPath = filteredSamples
    .filter((s) => s.eta_seconds != null)
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getX(s.elapsed_seconds)} ${getYEta(s.eta_seconds)}`)
    .join(' ');

  const naiveEtaPath = filteredSamples
    .filter((s) => s.naive_eta_seconds != null)
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${getX(s.elapsed_seconds)} ${getYEta(s.naive_eta_seconds)}`)
    .join(' ');

  return (
    <div className="fixed inset-0 z-[2000] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-card border border-border-strong rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border/80 bg-surface">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center text-accent shrink-0">
              <BarChart2 size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-primary flex items-center gap-2">
                <span>Batch Telemetry</span>
                {selectedBatchUid !== 'all' && (
                  <span className="px-2 py-0.5 rounded-full bg-card border border-border text-xs font-mono font-semibold text-accent">
                    Batch #{selectedBatchUid}
                  </span>
                )}
              </h3>
              <p className="text-xs text-secondary">
                Time-series execution profile & phase-weighted ETA extrapolation
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

        {/* Modal Controls Bar */}
        <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-border/60 bg-muted/20 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-secondary">Target Batch:</span>
            <select
              value={selectedBatchUid}
              onChange={(e) => setSelectedBatchUid(e.target.value)}
              className="bg-card border border-border rounded-lg px-3 py-1 text-xs text-primary font-bold focus:border-accent shadow-xs"
            >
              <option value="all">All Saved Batches ({telemetry.length} samples)</option>
              {batchUids.map((uid) => (
                <option key={uid} value={String(uid)}>
                  Batch #{uid}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={fetchTelemetry}
              disabled={loading}
              className="p-1.5 rounded-lg bg-card border border-border text-secondary hover:text-primary transition-colors cursor-pointer"
              title="Refresh telemetry"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>

            <button
              type="button"
              onClick={handleDownloadJson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-on-accent text-xs font-bold shadow-xs hover:bg-accent/90 transition-colors cursor-pointer"
            >
              <Download size={13} />
              <span>Export JSON</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {filteredSamples.length < 2 ? (
            <div className="py-12 text-center text-secondary">
              <Activity size={24} className="mx-auto mb-3 text-secondary/40 animate-pulse" />
              <p className="text-sm font-medium">No telemetry samples recorded for Batch #{selectedBatchUid}</p>
              <p className="text-xs text-secondary/70 mt-1 max-w-md mx-auto">
                Telemetry is recorded automatically while batches are processing. Run an harvest or index job to view execution curves.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {/* Chart 1: Progress Curves */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-primary">Progress Curve</span>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="flex items-center gap-1 text-amber-500 font-medium">
                      <span className="w-2 h-0.5 bg-amber-500 rounded-full" /> Raw Engine %
                    </span>
                    <span className="flex items-center gap-1 text-accent font-medium">
                      <span className="w-2 h-0.5 bg-accent rounded-full" /> Virtual Phase %
                    </span>
                  </div>
                </div>

                <div className="bg-surface border border-border/60 rounded-xl p-3">
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible">
                    {[0, 25, 50, 75, 100].map((v) => (
                      <line
                        key={v}
                        x1={P}
                        y1={getYPct(v)}
                        x2={W - P}
                        y2={getYPct(v)}
                        stroke="currentColor"
                        className="text-border/40"
                        strokeDasharray="2,2"
                      />
                    ))}
                    {rawPath && <path d={rawPath} fill="none" stroke="#F59E0B" strokeWidth="2" opacity="0.75" />}
                    {virtPath && <path d={virtPath} fill="none" stroke="var(--color-accent, #3B82F6)" strokeWidth="2.5" />}
                  </svg>
                </div>
              </div>

              {/* Chart 2: ETA Stability */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-primary">ETA Stability</span>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="flex items-center gap-1 text-red-400 font-medium">
                      <span className="w-2 h-0.5 bg-red-400 rounded-full" /> Naive Linear ETA
                    </span>
                    <span className="flex items-center gap-1 text-green-500 font-medium">
                      <span className="w-2 h-0.5 bg-green-500 rounded-full" /> Smoothed EWMA ETA
                    </span>
                  </div>
                </div>

                <div className="bg-surface border border-border/60 rounded-xl p-3">
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible">
                    {[0, maxEta * 0.5, maxEta].map((v, i) => (
                      <line
                        key={i}
                        x1={P}
                        y1={getYEta(v)}
                        x2={W - P}
                        y2={getYEta(v)}
                        stroke="currentColor"
                        className="text-border/40"
                        strokeDasharray="2,2"
                      />
                    ))}
                    {naiveEtaPath && (
                      <path d={naiveEtaPath} fill="none" stroke="#EF4444" strokeWidth="1.5" strokeDasharray="3,3" opacity="0.8" />
                    )}
                    {smoothedEtaPath && (
                      <path d={smoothedEtaPath} fill="none" stroke="#10B981" strokeWidth="2.5" />
                    )}
                  </svg>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
