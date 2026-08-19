import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Activity, Cpu, HardDrive, MemoryStick,
  Database, RefreshCw, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { ADMIN_API_BASE_URL } from '../config';

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
  <div className="bg-card border border-border rounded-lg p-4">
    <div className="flex items-center gap-2 mb-3">
      <Icon size={14} className="text-secondary shrink-0" />
      <span className="text-[10px] font-bold uppercase tracking-widest text-secondary">{label}</span>
    </div>
    <p className={`font-serif text-3xl leading-none mb-2 ${levelFor(percent)}`}>
      {Number.isFinite(percent) ? `${percent.toFixed(1)}%` : '—'}
    </p>
    {/* aria-hidden: the number above already conveys this to a screen reader. */}
    <div aria-hidden="true" className="h-1.5 rounded-full bg-muted overflow-hidden mb-2">
      <div
        className={`h-full rounded-full transition-all duration-500 ${
          percent >= 90 ? 'bg-red-500' : percent >= 70 ? 'bg-amber-500' : 'bg-green-600'
        }`}
        style={{ width: `${Math.min(100, Math.max(0, percent || 0))}%` }}
      />
    </div>
    <p className="text-xs text-secondary">{detail}</p>
  </div>
);

/**
 * Operational view of the archival API.
 *
 * Authenticates with the signed-in user's Firebase ID token, never a shared
 * secret: anything this page holds is readable by anyone who opens it, so a
 * static admin token here would be public. The API is expected to verify the
 * token and its `admin` claim independently — the route guard in App.jsx only
 * controls what is *shown*.
 */
const AdminDashboard = ({ getIdToken }) => {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState(null);

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
        setError(
          'The archival API rejected this account. It must verify the Firebase ID token ' +
          'and require an `admin` custom claim.'
        );
        return;
      }
      if (!res.ok) {
        setError(`The archival API returned ${res.status}.`);
        return;
      }
      setStatus(await res.json());
      setError(null);
      setFetchedAt(new Date());
    } catch {
      // A CORS rejection and a dead host are indistinguishable from here.
      setError('Could not reach the archival API. It may be offline, or not permit this origin.');
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const mem = status?.system?.memory;
  const disk = status?.system?.disk;
  const engine = status?.archival_engine;
  const online = status?.status === 'online';

  return (
    <main className="overflow-y-auto">
      <div className="reading-column py-12 sm:py-16" style={{ maxWidth: '980px' }}>
        <Link
          to="/chat"
          className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-secondary hover:text-accent transition-colors mb-8"
        >
          <ArrowLeft size={12} />
          Back to research
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
          <div>
            <h1 className="font-serif text-[32px] sm:text-[40px] font-semibold tracking-tight leading-tight mb-2">
              Archival API
            </h1>
            <p className="text-sm text-secondary">
              {fetchedAt
                ? `Updated ${fetchedAt.toLocaleTimeString()} · refreshes every ${REFRESH_MS / 1000}s`
                : 'Contacting the service…'}
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border-strong text-xs font-semibold text-secondary hover:text-primary hover:border-accent transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-3 bg-card border border-amber-500/40 rounded-lg p-4 mb-8">
            <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-secondary">{error}</p>
          </div>
        )}

        {status && (
          <>
            <div className="flex items-center gap-2 mb-6">
              {online
                ? <CheckCircle2 size={16} className="text-green-600" />
                : <AlertTriangle size={16} className="text-red-500" />}
              <span className="text-sm font-semibold text-primary">
                {online ? 'Online' : String(status.status || 'Unknown')}
              </span>
              <span className="text-sm text-secondary">
                · up {formatUptime(status.uptime_seconds)}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 mb-8">
              <Meter
                icon={Cpu}
                label="CPU"
                percent={status.system?.cpu_percent}
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
            </div>

            {engine && (
              <div className="bg-card border border-border rounded-lg p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Database size={14} className="text-secondary" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-secondary">
                    Archival engine
                  </span>
                </div>
                <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 text-sm">
                  <div className="flex justify-between gap-4 border-b border-border/50 pb-2">
                    <dt className="text-secondary">Index</dt>
                    <dd className="font-mono text-xs text-primary">{engine.index_name || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-border/50 pb-2">
                    <dt className="text-secondary">Documents</dt>
                    <dd className="font-mono text-xs text-primary">
                      {engine.stats?.numberOfDocuments?.toLocaleString() ?? '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-border/50 pb-2">
                    <dt className="text-secondary">Indexing</dt>
                    <dd className="font-mono text-xs text-primary">
                      {engine.stats?.isIndexing ? 'in progress' : 'idle'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-border/50 pb-2">
                    <dt className="text-secondary">Engine</dt>
                    <dd className="font-mono text-xs text-primary truncate" title={engine.meilisearch_url}>
                      {engine.meilisearch_url || '—'}
                    </dd>
                  </div>
                </dl>

                {engine.stats?.numberOfDocuments === 1 && (
                  <p className="mt-4 text-xs text-amber-500">
                    The index holds a single document — it looks seeded rather than populated.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {!status && !error && (
          <div className="flex items-center gap-3 text-sm text-secondary">
            <Activity size={16} className="animate-pulse" />
            Loading service status…
          </div>
        )}
      </div>
    </main>
  );
};

export default AdminDashboard;
