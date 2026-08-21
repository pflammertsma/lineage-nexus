import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Activity, Cpu, HardDrive, MemoryStick,
  Database, AlertTriangle, CheckCircle2,
  Layers, Search, PieChart,
} from 'lucide-react';
import { ADMIN_API_BASE_URL, setArchiveNames, ADMIN_CHART_RANGE_STORAGE } from '../config';
import MetricChart from './MetricChart';
import CorpusGrowthChart from './CorpusGrowthChart';
import ArchiveQuery from './ArchiveQuery';
import ArchiveCoverage from './ArchiveCoverage';
import IndexingProgress from './IndexingProgress';
import HarvestCatalog from './HarvestCatalog';
import { BatchTelemetryModal } from './BatchTelemetryModal';

const REFRESH_MS = 15_000;

function formatUptime(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${Math.floor(seconds % 60)}s`;
  return `${Math.round(seconds)}s`;
}

/** Green below 70%, amber to 90%, red past it — the same thresholds throughout. */
function levelFor(percent) {
  if (!Number.isFinite(percent)) return 'text-secondary';
  if (percent >= 90) return 'text-red-500';
  if (percent >= 70) return 'text-amber-500';
  return 'text-green-600';
}

const Meter = ({ icon: Icon, label, percent, detail }) => (
  <div className="admin-meter-card">
    <div className="admin-card-header">
      <Icon size={14} className="text-secondary shrink-0" />
      <span className="admin-card-title">{label}</span>
    </div>
    <p className={`font-serif text-3xl leading-none mb-2 ${levelFor(percent)}`}>
      {Number.isFinite(percent) ? `${percent.toFixed(1)}%` : '—'}
    </p>
    <div aria-hidden="true" className="h-1.5 rounded-full bg-muted overflow-hidden mb-2">
      <div
        className={`h-full rounded-full transition-all duration-500 ${percent >= 90 ? 'bg-red-500' : percent >= 70 ? 'bg-amber-500' : 'bg-green-600'
          }`}
        style={{ width: `${Math.min(100, Math.max(0, percent || 0))}%` }}
      />
    </div>
    <p className="text-xs text-secondary">{detail}</p>
  </div>
);

/**
 * Operational view of the archival API.
 * Header navigation, titles, and actions are rendered inside Header.jsx.
 */
const AdminDashboard = ({ getIdToken }) => {
  // Tab selection is written by Header.jsx; this view only reads it.
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';


  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [coverage, setCoverage] = useState(null);
  const [indexing, setIndexing] = useState(null);
  const [rangeMinutes, setRangeMinutesState] = useState(() => {
    try {
      const stored = localStorage.getItem(ADMIN_CHART_RANGE_STORAGE);
      return stored ? Number(stored) : 360;
    } catch {
      return 360;
    }
  });

  const setRangeMinutes = useCallback((mins) => {
    setRangeMinutesState(mins);
    try {
      localStorage.setItem(ADMIN_CHART_RANGE_STORAGE, String(mins));
    } catch {
      // Ignore storage error
    }
  }, []);

  const [error, setError] = useState(null);
  // Only the setter is used — the spinner reads it via the refresh button's
  // own disabled state, so the value itself has no reader.
  const [, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState(null);

  const [telemetryModalOpen, setTelemetryModalOpen] = useState(false);
  const [telemetryBatchUid, setTelemetryBatchUid] = useState('all');

  const handleOpenTelemetry = useCallback((batchUid = 'all') => {
    setTelemetryBatchUid(String(batchUid));
    setTelemetryModalOpen(true);
  }, []);

  const [reconnecting, setReconnecting] = useState(false);
  const failures = useRef(0);
  const TRANSIENT_TOLERANCE = 2;

  const noteFailure = useCallback((message) => {
    failures.current += 1;
    if (failures.current >= TRANSIENT_TOLERANCE) {
      setReconnecting(false);
      setError(message);
      window.dispatchEvent(
        new CustomEvent('admin-system-stress', { detail: { level: 'critical' } })
      );
    } else {
      setReconnecting(true);
    }
  }, []);

  const load = useCallback(async () => {
    if (!ADMIN_API_BASE_URL) {
      setError('No admin API configured. Set VITE_ADMIN_API_BASE_URL and rebuild.');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = await getIdToken();
      if (!token) {
        setError('Could not obtain an identity token. Try signing out and back in.');
        return;
      }
      const res = await fetch(`${ADMIN_API_BASE_URL}/api/v1/admin/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) {
        failures.current = 0;
        setReconnecting(false);
        setError(
          'The archival API rejected this account. It must verify the Firebase ID token and require an `admin` custom claim.'
        );
        return;
      }
      if (!res.ok) {
        noteFailure(`The archival API returned ${res.status}.`);
        return;
      }
      const nextStatus = await res.json();
      failures.current = 0;
      setReconnecting(false);
      setStatus(nextStatus);
      setError(null);
      setFetchedAt(new Date());

      let points = [];
      try {
        const histRes = await fetch(
          `${ADMIN_API_BASE_URL}/api/v1/admin/history?minutes=${rangeMinutes}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (histRes.ok) {
          const body = await histRes.json();
          if (body.status === 'success') {
            points = body.points || [];
            setHistory(points);
          }
        }
      } catch {
        // Non-critical
      }

      // Compute 3-minute moving average over recent history samples (~12 x 15s points) to prevent spurious dots
      const recentSamples = points.slice(-12);
      let cpuAvg = nextStatus?.system?.cpu_percent ?? 0;
      let memAvg = nextStatus?.system?.memory?.percent ?? 0;
      let diskAvg = nextStatus?.system?.disk?.percent ?? 0;
      let iowaitAvg = nextStatus?.system?.iowait_percent ?? 0;

      if (recentSamples.length > 0) {
        const cpuVals = recentSamples.map((p) => p.cpu).filter((v) => typeof v === 'number');
        const memVals = recentSamples.map((p) => p.mem).filter((v) => typeof v === 'number');
        const diskVals = recentSamples.map((p) => p.disk).filter((v) => typeof v === 'number');
        const ioVals = recentSamples.map((p) => p.iowait).filter((v) => typeof v === 'number');

        if (cpuVals.length) cpuAvg = cpuVals.reduce((a, b) => a + b, 0) / cpuVals.length;
        if (memVals.length) memAvg = memVals.reduce((a, b) => a + b, 0) / memVals.length;
        if (diskVals.length) diskAvg = diskVals.reduce((a, b) => a + b, 0) / diskVals.length;
        if (ioVals.length) iowaitAvg = ioVals.reduce((a, b) => a + b, 0) / ioVals.length;
      }

      const isOnline = nextStatus?.status === 'online';

      let stressLevel = 'normal';
      if (!isOnline || cpuAvg >= 90 || memAvg >= 90 || diskAvg >= 80) {
        stressLevel = 'critical';
      } else if (cpuAvg >= 85 || memAvg >= 85 || diskAvg >= 60 || iowaitAvg >= 40) {
        stressLevel = 'warning';
      }

      window.dispatchEvent(
        new CustomEvent('admin-system-stress', { detail: { level: stressLevel } })
      );

      try {
        const covRes = await fetch(`${ADMIN_API_BASE_URL}/api/v1/admin/coverage`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (covRes.ok) {
          const body = await covRes.json();
          if (body.status === 'success') setCoverage(body);
        }
      } catch {
        // Non-critical
      }

      try {
        const idxRes = await fetch(`${ADMIN_API_BASE_URL}/api/v1/admin/indexing`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (idxRes.ok) {
          const body = await idxRes.json();
          if (body.status === 'success') {
            setIndexing(body);
            if (body.archive_names) setArchiveNames(body.archive_names);

            const isIndexingActive = Boolean(
              body.is_indexing ||
              body.current_batch ||
              body.current_ingest?.is_active ||
              (body.queue && body.queue.total_pending > 0)
            );

            window.dispatchEvent(
              new CustomEvent('admin-indexing-active', { detail: { active: isIndexingActive } })
            );
          }
        }
      } catch {
        // Non-critical
      }
    } catch {
      noteFailure('Could not reach the archival API.');
    } finally {
      setLoading(false);
    }
  }, [getIdToken, rangeMinutes, noteFailure]);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  // Listen for Header refresh button clicks
  useEffect(() => {
    const handleHeaderRefresh = () => load();
    window.addEventListener('admin-refresh', handleHeaderRefresh);
    return () => window.removeEventListener('admin-refresh', handleHeaderRefresh);
  }, [load]);

  const online = !error && !reconnecting && status?.status === 'online';
  const mem = status?.system?.memory;
  const disk = status?.system?.disk;
  const diskIo = status?.system?.disk_io;
  const engine = status?.archival_engine;

  return (
    <main className="admin-page-container">
      <div className="admin-content-wrap">

        {error && (
          <div className="flex items-start gap-3 bg-card border border-amber-500/40 rounded-lg p-4 mb-6">
            <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-secondary">{error}</p>
          </div>
        )}

        {(status || error || reconnecting) && (
          <>
            {/* Tab 1: System Overview */}
            {activeTab === 'overview' && (
              <div className="space-y-8">
                <div className="flex items-center justify-between gap-3 flex-wrap bg-card border border-border rounded-lg p-3 px-4">
                  <div className="flex items-center gap-2 text-xs">
                    {online ? (
                      <CheckCircle2 size={15} className="text-green-600 shrink-0" />
                    ) : (
                      <AlertTriangle size={15} className="text-red-500 shrink-0" />
                    )}
                    <span className="font-semibold text-primary">
                      {online ? 'Online' : reconnecting ? 'Reconnecting…' : 'Offline / Unreachable'}
                    </span>
                    {online && status?.uptime_seconds != null && (
                      <span className="text-secondary">· up {formatUptime(status?.uptime_seconds)}</span>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Meter
                    icon={Cpu}
                    label="CPU"
                    percent={status?.system?.cpu_percent}
                    detail="Processor load"
                  />
                  <Meter
                    icon={MemoryStick}
                    label="Memory"
                    percent={mem?.percent}
                    detail={mem ? `${Math.round(mem.used_mb)} of ${Math.round(mem.total_mb)} MB` : '—'}
                  />
                  <Meter
                    icon={HardDrive}
                    label="Disk"
                    percent={disk?.percent}
                    detail={disk ? `${disk.used_gb?.toFixed(1)} of ${disk.total_gb?.toFixed(1)} GB` : '—'}
                  />
                  <Meter
                    icon={Activity}
                    label="I/O Wait"
                    percent={status?.system?.iowait_percent}
                    detail={
                      diskIo
                        ? `${diskIo.read_mbs?.toFixed(1) || '0.0'} MB/s r · ${diskIo.write_mbs?.toFixed(1) || '0.0'} MB/s w`
                        : 'CPU waiting on disk I/O'
                    }
                  />
                </div>

                <MetricChart
                  points={history}
                  rangeMinutes={rangeMinutes}
                  onRangeChange={setRangeMinutes}
                />

                {engine && (
                  <div className="admin-card">
                    <div className="admin-card-header">
                      <Database size={14} className="text-secondary shrink-0" />
                      <span className="admin-card-title">Archival engine</span>
                    </div>
                    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 text-sm">
                      <div className="flex justify-between gap-4 border-b border-border/50 pb-2">
                        <dt className="text-secondary">Index</dt>
                        <dd className="text-xs text-primary">{engine.index_name || '—'}</dd>
                      </div>
                      <div className="flex justify-between gap-4 border-b border-border/50 pb-2">
                        <dt className="text-secondary">Documents</dt>
                        <dd className="tabular-nums text-xs text-primary">
                          {engine.stats?.numberOfDocuments?.toLocaleString() ?? '—'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4 border-b border-border/50 pb-2">
                        <dt className="text-secondary">Indexing</dt>
                        <dd className="tabular-nums text-xs text-primary">
                          {engine.stats?.isIndexing ? 'in progress' : 'idle'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4 border-b border-border/50 pb-2">
                        <dt className="text-secondary">Engine</dt>
                        <dd className="text-xs text-primary truncate" title={engine.meilisearch_url}>
                          {engine.meilisearch_url || '—'}
                        </dd>
                      </div>
                    </dl>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Ingest & Harvester Queue */}
            {activeTab === 'harvesting' && (
              <div className="space-y-8">
                <IndexingProgress
                  indexing={indexing}
                  onOpenTelemetry={handleOpenTelemetry}
                  getIdToken={getIdToken}
                  onRefresh={load}
                />
                <HarvestCatalog getIdToken={getIdToken} onHarvestQueued={load} />
              </div>
            )}

            {/* Tab 3: Corpus Coverage */}
            {activeTab === 'coverage' && (
              <div className="space-y-8">
                <CorpusGrowthChart
                  points={history}
                  rangeMinutes={rangeMinutes}
                  onRangeChange={setRangeMinutes}
                />
                <ArchiveCoverage coverage={coverage} />
              </div>
            )}

            {/* Tab 4: Index Explorer */}
            {activeTab === 'query' && (
              <div className="space-y-8">
                <ArchiveQuery getIdToken={getIdToken} />
              </div>
            )}

            {/* Page Footer: Refresh Timestamp */}
            <footer className="mt-4 text-center text-xs text-secondary/70">
              {reconnecting
                ? 'Reconnecting…'
                : fetchedAt
                  ? `Updated ${fetchedAt.toLocaleTimeString()} · refreshes every ${REFRESH_MS / 1000}s`
                  : 'Contacting service…'}
            </footer>
          </>
        )}

        {!status && !error && (
          <div className="flex items-center gap-3 text-sm text-secondary py-8">
            <Activity size={16} className="animate-pulse" />
            Loading service status…
          </div>
        )}
      </div>

      <BatchTelemetryModal
        isOpen={telemetryModalOpen}
        onClose={() => setTelemetryModalOpen(false)}
        initialBatchUid={telemetryBatchUid}
        getIdToken={getIdToken}
      />
    </main>
  );
};

export default AdminDashboard;
