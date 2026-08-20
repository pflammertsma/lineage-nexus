import React, { useState, useEffect, useCallback } from 'react';
import { Download, Activity, RefreshCw, BarChart2 } from 'lucide-react';
import { ADMIN_API_BASE_URL } from '../config';

function formatSecs(seconds) {
  if (!Number.isFinite(seconds) || seconds === null) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${Math.round(seconds % 60)}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export const BatchTelemetryDebug = ({ getIdToken }) => {
  const [telemetry, setTelemetry] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBatchUid, setSelectedBatchUid] = useState('all');

  const fetchTelemetry = useCallback(async () => {
    if (!ADMIN_API_BASE_URL) return;
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
  }, [getIdToken]);

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 15000);
    return () => clearInterval(interval);
  }, [fetchTelemetry]);

  const handleDownloadCsv = async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const url = `${ADMIN_API_BASE_URL}/api/v1/admin/batch-telemetry?format=csv${
        selectedBatchUid !== 'all' ? `&batch_uid=${selectedBatchUid}` : ''
      }`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = window.URL.createObjectURL(blob);
      a.download = `batch_telemetry_${selectedBatchUid}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      // Fallback
    }
  };

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
    <div className="bg-card border border-border/80 rounded-xl p-5 mt-6 shadow-sm">
      {/* Header & Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5 pb-4 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <BarChart2 size={16} className="text-accent shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-primary">Batch Telemetry & ETA Debugger</h4>
            <p className="text-xs text-secondary">
              Phase-weighted progress modeling vs. naive linear ETA swings
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {batchUids.length > 0 && (
            <select
              value={selectedBatchUid}
              onChange={(e) => setSelectedBatchUid(e.target.value)}
              className="bg-surface border border-border rounded-lg px-2.5 py-1 text-xs text-primary font-medium focus:border-accent"
            >
              <option value="all">All Batches ({telemetry.length} samples)</option>
              {batchUids.map((uid) => (
                <option key={uid} value={uid}>
                  Batch {uid}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={fetchTelemetry}
            disabled={loading}
            className="p-1.5 rounded-lg bg-surface border border-border text-secondary hover:text-primary transition-colors cursor-pointer"
            title="Refresh telemetry"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            type="button"
            onClick={handleDownloadCsv}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-accent text-on-accent text-xs font-bold shadow-xs hover:bg-accent/90 transition-colors cursor-pointer"
          >
            <Download size={13} />
            <span>CSV Data</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadJson}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-card border border-border text-primary text-xs font-medium hover:border-accent transition-colors cursor-pointer"
          >
            <Download size={13} />
            <span>JSON</span>
          </button>
        </div>
      </div>

      {filteredSamples.length < 2 ? (
        <p className="text-xs text-secondary/70 italic py-4 text-center">
          Collecting batch execution telemetry samples... Run an harvest or index job to populate debug charts.
        </p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Chart 1: Progress Curves */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-primary">Progress Curve (Phase-Weighted)</span>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1 text-amber-500 font-medium">
                  <span className="w-2 h-0.5 bg-amber-500 rounded-full" /> Raw Engine %
                </span>
                <span className="flex items-center gap-1 text-accent font-medium">
                  <span className="w-2 h-0.5 bg-accent rounded-full" /> Virtual Phase %
                </span>
              </div>
            </div>

            <div className="bg-surface/50 border border-border/50 rounded-lg p-2 overflow-hidden">
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible">
                {/* Grid lines */}
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
                {/* Paths */}
                {rawPath && <path d={rawPath} fill="none" stroke="#F59E0B" strokeWidth="2" opacity="0.75" />}
                {virtPath && <path d={virtPath} fill="none" stroke="var(--color-accent, #3B82F6)" strokeWidth="2.5" />}
              </svg>
            </div>
          </div>

          {/* Chart 2: ETA Stability */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-primary">ETA Stability (Smoothed vs. Naive)</span>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1 text-red-400 font-medium">
                  <span className="w-2 h-0.5 bg-red-400 rounded-full stroke-dasharray" /> Naive Linear ETA
                </span>
                <span className="flex items-center gap-1 text-green-500 font-medium">
                  <span className="w-2 h-0.5 bg-green-500 rounded-full" /> Smoothed EWMA ETA
                </span>
              </div>
            </div>

            <div className="bg-surface/50 border border-border/50 rounded-lg p-2 overflow-hidden">
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible">
                {/* Grid lines */}
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
                {/* Paths */}
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
  );
};
