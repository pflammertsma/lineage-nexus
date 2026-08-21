import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Download, RefreshCw, BarChart2, X, Activity, Clock, AlertTriangle } from 'lucide-react';
import { ADMIN_API_BASE_URL } from '../config';
import { formatDuration } from '../utils/formatters';
import SmoothLineChart from './SmoothLineChart';

const PROGRESS_SERIES = [
  {
    field: 'raw_progress_pct',
    label: 'Raw Engine %',
    colour: '#F59E0B',
    formatter: (val) => `${(typeof val === 'number' ? val : 0).toFixed(1)}%`,
  },
  {
    field: 'virtual_progress_pct',
    label: 'Virtual Phase %',
    colour: 'var(--color-accent)',
    formatter: (val) => `${(typeof val === 'number' ? val : 0).toFixed(1)}%`,
  },
];

const ETA_SERIES = [
  {
    field: 'naive_eta_seconds',
    label: 'Naive Linear ETA',
    colour: '#EF4444',
    formatter: (val) => formatDuration(val),
  },
  {
    field: 'eta_seconds',
    label: 'Smoothed EWMA ETA',
    colour: '#10B981',
    formatter: (val) => formatDuration(val),
  },
];

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

  const chartPoints = useMemo(() => {
    const filtered =
      selectedBatchUid === 'all'
        ? telemetry
        : telemetry.filter((s) => String(s.batch_uid) === String(selectedBatchUid));

    return filtered.map((s, idx) => ({
      t: s.timestamp || (s.elapsed_seconds != null ? s.elapsed_seconds : idx * 15),
      raw_progress_pct: typeof s.raw_progress_pct === 'number' ? s.raw_progress_pct : 0,
      virtual_progress_pct: typeof s.virtual_progress_pct === 'number' ? s.virtual_progress_pct : 0,
      eta_seconds: typeof s.eta_seconds === 'number' ? s.eta_seconds : null,
      naive_eta_seconds: typeof s.naive_eta_seconds === 'number' ? s.naive_eta_seconds : null,
    }));
  }, [telemetry, selectedBatchUid]);

  if (!isOpen) return null;

  const handleDownloadJson = () => {
    const filtered =
      selectedBatchUid === 'all'
        ? telemetry
        : telemetry.filter((s) => String(s.batch_uid) === String(selectedBatchUid));
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filtered, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `batch_telemetry_${selectedBatchUid}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Distinct batch UIDs
  const batchUids = Array.from(new Set(telemetry.map((s) => s.batch_uid).filter(Boolean)));

  return (
    <div className="fixed inset-0 z-[2000] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-card border border-border-strong rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
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
          {chartPoints.length < 2 ? (
            <div className="py-12 text-center text-secondary">
              <Activity size={24} className="mx-auto mb-3 text-secondary/40 animate-pulse" />
              <p className="text-sm font-medium">No telemetry samples recorded for Batch #{selectedBatchUid}</p>
              <p className="text-xs text-secondary/70 mt-1 max-w-md mx-auto">
                Telemetry is recorded automatically while batches are processing. Run an harvest or index job to view execution curves.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              <SmoothLineChart
                icon={Activity}
                title="Progress Curve"
                points={chartPoints}
                series={PROGRESS_SERIES}
                autoScaleY={false}
                maxY={100}
                height={240}
                ranges={[]}
                emptyMessage="Collecting batch progress samples…"
              />

              <SmoothLineChart
                icon={Clock}
                title="ETA Stability"
                points={chartPoints}
                series={ETA_SERIES}
                autoScaleY={true}
                height={240}
                ranges={[]}
                emptyMessage="Collecting batch ETA samples…"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
