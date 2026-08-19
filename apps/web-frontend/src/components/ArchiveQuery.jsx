import React, { useState } from 'react';
import { Search, ExternalLink, Loader2 } from 'lucide-react';
import { ADMIN_API_BASE_URL } from '../config';

/**
 * What each record-type code means. Verified against the live index by reading
 * the EVENT_TYPE of real documents rather than inferred from the abbreviations —
 * `dtb_b`/`dtb_d` are easy to transpose (Begraven vs Doop) and getting them
 * backwards would mislabel every burial as a baptism.
 *
 * BS = Burgerlijke Stand, civil registration from 1811.
 * DTB = Doop-, Trouw- en Begraafboeken, the church registers that precede it.
 */
const KIND_LABELS = {
  bsg: 'Burgerlijke Stand — Geboorte (civil birth register, 1811 onwards)',
  bsh: 'Burgerlijke Stand — Huwelijk (civil marriage register, 1811 onwards)',
  bso: 'Burgerlijke Stand — Overlijden (civil death register, 1811 onwards)',
  bev: 'Bevolkingsregister (population register — households and residents)',
  dtb_d: 'DTB — Doop (church baptism register, generally pre-1811)',
  dtb_t: 'DTB — Trouwen (church marriage register, generally pre-1811)',
  dtb_b: 'DTB — Begraven (church burial register, generally pre-1811)',
  not: 'Notarieel (notarial deeds — wills, estates, contracts)',
};

const kindLabel = (kind) => KIND_LABELS[kind] || `Record type: ${kind}`;

/**
 * How a hit was retrieved — not who owns it. Every record originates with Open
 * Archieven; the distinction is whether we answered from our own harvested
 * snapshot or asked them live. It matters for latency, and for freshness: a
 * snapshot can lag corrections made upstream.
 */
const RETRIEVAL = {
  index: {
    label: 'local',
    title: 'Answered from our harvested index — fast, but a snapshot of an export, so it can lag corrections made at Open Archieven.',
    className: 'bg-green-600/15 text-green-600 border-green-600/30',
  },
  openarchieven: {
    label: 'live',
    title: 'Fetched from the Open Archieven API because our index had no match — current, but rate limited.',
    className: 'bg-accent-soft text-accent border-accent/30',
  },
};

/**
 * Raw index search, for checking what is actually in there.
 *
 * No agent, no orchestration, no interpretation — the point is to see the index
 * as it is. Every hit shows which archive and record type it came from, because
 * the question this answers is usually "did that export ingest correctly", not
 * "who was this person".
 */
const ArchiveQuery = ({ getIdToken }) => {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async (e) => {
    e.preventDefault();
    const q = query.trim();
    if (!q || loading) return;

    setLoading(true);
    setError(null);
    try {
      const token = await getIdToken();
      if (!token) {
        setError('Could not obtain an identity token. Sign out and back in.');
        return;
      }
      const res = await fetch(
        `${ADMIN_API_BASE_URL}/api/v1/admin/query?q=${encodeURIComponent(q)}&limit=25`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        setError(`The archival API returned ${res.status}.`);
        return;
      }
      const data = await res.json();
      if (data.status === 'error') {
        setError(data.error_message || 'The query failed.');
        return;
      }
      setResult(data);
    } catch {
      setError('Could not reach the archival API.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <Search size={14} className="text-secondary" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-secondary">
          Archive query
        </span>
        <span className="text-[10px] text-secondary/60 normal-case tracking-normal">
          · direct index search, no AI
        </span>
      </div>

      <form onSubmit={run} className="flex gap-2 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name or place, e.g. Langeraap"
          className="input-field flex-1 font-mono text-[13px]"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-5 rounded-lg bg-accent text-on-accent text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40 flex items-center gap-2"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          Search
        </button>
      </form>

      {error && <p className="text-xs text-amber-500 mb-3">{error}</p>}

      {result && (
        <>
          <p className="text-xs text-secondary mb-3">
            {result.estimated_total.toLocaleString()} match
            {result.estimated_total === 1 ? '' : 'es'} · showing {result.returned} ·{' '}
            <span className="font-mono">{result.took_ms}ms</span>
            {result.sources && (
              <>
                {' · '}
                <span title={RETRIEVAL.index.title} className="cursor-help">
                  {result.sources.index} local
                </span>
                {', '}
                <span title={RETRIEVAL.openarchieven.title} className="cursor-help">
                  {result.sources.openarchieven} live
                </span>
              </>
            )}
          </p>

          {result.hits.length === 0 ? (
            <p className="text-xs text-secondary italic">
              Nothing in the index for that. It may simply not be harvested yet —
              coverage is per archive.
            </p>
          ) : (
            <ol className="space-y-2 max-h-[26rem] overflow-y-auto pr-1">
              {result.hits.map((hit) => (
                <li key={hit.id} className="border border-border/60 rounded-lg p-3 text-xs">
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <span className="text-primary font-semibold break-words">{hit.names}</span>
                    {hit.url && (
                      <a
                        href={hit.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="shrink-0 text-accent hover:underline inline-flex items-center gap-1"
                        title="Open at Open Archieven"
                      >
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>

                  <p className="text-secondary mb-2">
                    {[hit.event_type, hit.event_date, hit.event_place].filter(Boolean).join(' · ')}
                  </p>

                  {/* Provenance: how it was retrieved, then which export it came from. */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    {(() => {
                      const r = RETRIEVAL[hit.retrieved_from] || RETRIEVAL.index;
                      return (
                        <span
                          title={r.title}
                          className={`px-1.5 py-0.5 rounded border font-mono text-[10px] cursor-help ${r.className}`}
                        >
                          {r.label}
                        </span>
                      );
                    })()}
                    <span
                      title={hit.source.institution
                        ? `${hit.source.archive} — ${hit.source.institution}`
                        : `Archive code: ${hit.source.archive}`}
                      className="px-1.5 py-0.5 rounded bg-accent-soft text-accent font-mono text-[10px] cursor-help"
                    >
                      {hit.source.archive}
                    </span>
                    <span
                      title={kindLabel(hit.source.kind)}
                      className="px-1.5 py-0.5 rounded bg-muted text-secondary font-mono text-[10px] cursor-help"
                    >
                      {hit.source.kind}
                    </span>
                    <span className="text-secondary/70 text-[10px]">{hit.source.institution}</span>
                    {hit.source.last_changed && (
                      <span
                        title={`Open Archieven last changed this record on ${hit.source.last_changed}. Our copy reflects the export taken after that date.`}
                        className="text-secondary/50 text-[10px] font-mono cursor-help"
                      >
                        upd {hit.source.last_changed}
                      </span>
                    )}
                  </div>

                  {hit.persons?.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-secondary">
                      {hit.persons.map((p, i) => (
                        <span key={i}>
                          <span className="text-primary/80">{p.n}</span>
                          <span className="text-secondary/60"> · {p.r}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
};

export default ArchiveQuery;
