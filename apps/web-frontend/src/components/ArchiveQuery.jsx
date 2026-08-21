import React, { useState } from 'react';
import { Search, ExternalLink, Loader2, ChevronRight, SlidersHorizontal, MapPin, Calendar, X, Filter } from 'lucide-react';
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
 * Raw index search, for checking what is actually in there.
 *
 * No agent, no orchestration, no interpretation — the point is to see the index
 * as it is. Every hit shows which archive and record type it came from, because
 * the question this answers is usually "did that export ingest correctly", not
 * "who was this person".
 */
const ArchiveQuery = ({ getIdToken }) => {
  const [query, setQuery] = useState('');
  const [place, setPlace] = useState('');
  const [kind, setKind] = useState('all');
  const [yearMin, setYearMin] = useState('');
  const [yearMax, setYearMax] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());

  const toggle = (id) =>
    setExpanded((open) => {
      const next = new Set(open);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const activeFilterCount =
    (place.trim() ? 1 : 0) +
    (kind !== 'all' ? 1 : 0) +
    (yearMin.trim() ? 1 : 0) +
    (yearMax.trim() ? 1 : 0);

  const clearAllFilters = () => {
    setPlace('');
    setKind('all');
    setYearMin('');
    setYearMax('');
  };

  const applyYearPreset = (min, max) => {
    setYearMin(String(min));
    setYearMax(String(max));
  };

  const run = async (e) => {
    if (e) e.preventDefault();
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

      let url = `${ADMIN_API_BASE_URL}/api/v1/admin/query?q=${encodeURIComponent(q)}&limit=25`;
      if (place.trim()) url += `&place=${encodeURIComponent(place.trim())}`;
      if (kind !== 'all') url += `&kind=${encodeURIComponent(kind)}`;
      if (yearMin.trim() && !isNaN(parseInt(yearMin))) url += `&year_min=${parseInt(yearMin)}`;
      if (yearMax.trim() && !isNaN(parseInt(yearMax))) url += `&year_max=${parseInt(yearMax)}`;

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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
      setExpanded(new Set());
    } catch {
      setError('Could not reach the archival API.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-secondary" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-secondary">
            Archive query
          </span>
          <span className="text-[10px] text-secondary/60 normal-case tracking-normal">
            · direct index search, no AI
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs transition-colors cursor-pointer ${
            showFilters || activeFilterCount > 0
              ? 'bg-accent/10 border-accent/40 text-accent font-semibold'
              : 'bg-surface border-border text-secondary hover:text-primary'
          }`}
        >
          <SlidersHorizontal size={13} />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-accent text-on-accent text-[10px] font-bold flex items-center justify-center ml-0.5">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      <form onSubmit={run} className="space-y-3 mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search name or query with inline syntax (e.g. "Jan de Vries place:Leeuwarden year:1840..1860 type:birth")'
            className="input-field flex-1 text-[13px]"
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
        </div>

        {/* Expandable Filter Drawer */}
        {showFilters && (
          <div className="bg-surface/60 border border-border/80 rounded-lg p-4 space-y-4 animate-in fade-in duration-150">
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Record / Event Type Filter */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                  Record / Event Type
                </label>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                  className="w-full bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-primary font-medium focus:border-accent shadow-xs"
                >
                  <option value="all">All Types & Events</option>
                  <option value="bsg,dtb_d">Births & Baptisms (Geboorte / Doop)</option>
                  <option value="bsh,dtb_t">Marriages (Huwelijk / Trouwen)</option>
                  <option value="bso,dtb_b">Deaths & Burials (Overlijden / Begraven)</option>
                  <option value="bev">Population Register (Bevolkingsregister)</option>
                  <option value="not">Notarial Deeds (Notarieel)</option>
                </select>
              </div>

              {/* Event Place / Location Filter */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                  Location / City
                </label>
                <div className="relative">
                  <MapPin size={13} className="absolute left-2.5 top-2 text-secondary/60 pointer-events-none" />
                  <input
                    type="text"
                    value={place}
                    onChange={(e) => setPlace(e.target.value)}
                    placeholder="e.g. Leeuwarden or Delft"
                    className="w-full bg-card border border-border rounded-md pl-8 pr-2.5 py-1.5 text-xs text-primary focus:border-accent shadow-xs"
                  />
                </div>
              </div>

              {/* Year Range Filter */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                  Event Year Range
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={yearMin}
                    onChange={(e) => setYearMin(e.target.value)}
                    placeholder="Min (1840)"
                    className="w-1/2 bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-primary focus:border-accent shadow-xs font-mono"
                  />
                  <span className="text-secondary text-xs">–</span>
                  <input
                    type="number"
                    value={yearMax}
                    onChange={(e) => setYearMax(e.target.value)}
                    placeholder="Max (1860)"
                    className="w-1/2 bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-primary focus:border-accent shadow-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Quick Presets & Controls */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/40 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-secondary">
                <span className="font-semibold text-secondary/70">Year Presets:</span>
                <button
                  type="button"
                  onClick={() => applyYearPreset(1800, 1850)}
                  className="px-2 py-0.5 rounded bg-card border border-border hover:border-accent text-primary cursor-pointer transition-colors"
                >
                  1800–1850
                </button>
                <button
                  type="button"
                  onClick={() => applyYearPreset(1850, 1900)}
                  className="px-2 py-0.5 rounded bg-card border border-border hover:border-accent text-primary cursor-pointer transition-colors"
                >
                  1850–1900
                </button>
                <button
                  type="button"
                  onClick={() => applyYearPreset(1900, 1940)}
                  className="px-2 py-0.5 rounded bg-card border border-border hover:border-accent text-primary cursor-pointer transition-colors"
                >
                  1900–1940
                </button>
              </div>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-xs text-amber-500 hover:underline font-semibold cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        )}

        {/* Active Filter Badges Bar */}
        {activeFilterCount > 0 && !showFilters && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-semibold text-secondary/70">Active Filters:</span>
            {kind !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent text-[11px] font-medium">
                Type: {kind === 'bsg,dtb_d' ? 'Births' : kind === 'bsh,dtb_t' ? 'Marriages' : kind === 'bso,dtb_b' ? 'Deaths' : kind}
                <X size={11} className="cursor-pointer hover:opacity-80" onClick={() => setKind('all')} />
              </span>
            )}
            {place.trim() && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent text-[11px] font-medium">
                City: {place.trim()}
                <X size={11} className="cursor-pointer hover:opacity-80" onClick={() => setPlace('')} />
              </span>
            )}
            {(yearMin.trim() || yearMax.trim()) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent text-[11px] font-medium font-mono">
                Years: {yearMin || '...'} – {yearMax || '...'}
                <X size={11} className="cursor-pointer hover:opacity-80" onClick={() => { setYearMin(''); setYearMax(''); }} />
              </span>
            )}
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-[10px] text-secondary hover:text-primary underline ml-1 cursor-pointer"
            >
              Reset
            </button>
          </div>
        )}
      </form>

      {error && <p className="text-xs text-amber-500 mb-3">{error}</p>}

      {result && (
        <>
          <p className="text-xs text-secondary mb-3">
            {result.estimated_total.toLocaleString()} match
            {result.estimated_total === 1 ? '' : 'es'} · showing {result.returned} ·{' '}
            <span className="tabular-nums">{result.took_ms}ms</span>
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
                    <button
                      type="button"
                      onClick={() => toggle(hit.id)}
                      aria-expanded={expanded.has(hit.id)}
                      className="flex items-start gap-1.5 text-left text-primary font-semibold break-words hover:text-accent transition-colors cursor-pointer"
                    >
                      <ChevronRight
                        size={13}
                        className={`mt-0.5 shrink-0 transition-transform ${
                          expanded.has(hit.id) ? 'rotate-90' : ''
                        }`}
                      />
                      {hit.names}
                    </button>
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

                  {/* Which export this came from. Every hit is served from our
                      own index, so there is no retrieval path worth showing. */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    <span
                      title={hit.source.institution
                        ? `${hit.source.archive} — ${hit.source.institution}`
                        : `Archive code: ${hit.source.archive}`}
                      className="px-1.5 py-0.5 rounded bg-accent-soft text-accent text-[10px] cursor-help"
                    >
                      {hit.source.archive}
                    </span>
                    <span
                      title={kindLabel(hit.source.kind)}
                      className="px-1.5 py-0.5 rounded bg-muted text-secondary text-[10px] cursor-help"
                    >
                      {hit.source.kind}
                    </span>
                    <span className="text-secondary/70 text-[10px]">{hit.source.institution}</span>
                    {hit.source.last_changed && (
                      <span
                        title={`Open Archieven last changed this record on ${hit.source.last_changed}. Our copy reflects the export taken after that date.`}
                        className="text-secondary/50 text-[10px] tabular-nums cursor-help"
                      >
                        upd {hit.source.last_changed}
                      </span>
                    )}
                  </div>

                  {expanded.has(hit.id) && (
                    <pre className="mb-2 p-2.5 rounded bg-muted/60 border border-border/60 text-[10px] leading-relaxed font-mono text-secondary overflow-x-auto max-h-72 overflow-y-auto">
{JSON.stringify(hit.raw ?? hit, null, 2)}
                    </pre>
                  )}

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
