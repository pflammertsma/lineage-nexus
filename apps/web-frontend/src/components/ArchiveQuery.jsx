import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ExternalLink, Loader2, ChevronRight, SlidersHorizontal, MapPin, X, HelpCircle } from 'lucide-react';
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
 * Direct search on the Meilisearch index.
 * No agent, no orchestration, no interpretation — the point is to see the index
 * as it is. Every hit shows which archive and record type it came from, because
 * the question this answers is usually "did that export ingest correctly", not
 * "who was this person".
 */
const ArchiveQuery = ({ getIdToken }) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [query, setQuery] = useState(() => searchParams.get('q') || '');
  const [archive, setArchive] = useState(() => searchParams.get('archive') || 'all');
  const [place, setPlace] = useState(() => searchParams.get('place') || '');
  const [kind, setKind] = useState(() => searchParams.get('kind') || 'all');
  const [yearMin, setYearMin] = useState(() => searchParams.get('year_min') || '');
  const [yearMax, setYearMax] = useState(() => searchParams.get('year_max') || '');
  const [father, setFather] = useState(() => searchParams.get('father') || '');
  const [mother, setMother] = useState(() => searchParams.get('mother') || '');
  const [child, setChild] = useState(() => searchParams.get('child') || '');
  const [spouse, setSpouse] = useState(() => searchParams.get('spouse') || '');
  const [role, setRole] = useState(() => searchParams.get('role') || 'all');
  const [fuzzy, setFuzzy] = useState(() => searchParams.get('fuzzy') !== 'false');
  const [namesOnly, setNamesOnly] = useState(() => searchParams.get('names_only') !== 'false');
  const [showFilters, setShowFilters] = useState(() => {
    return Boolean(
      (searchParams.get('archive') && searchParams.get('archive') !== 'all') ||
      searchParams.get('place') ||
      (searchParams.get('kind') && searchParams.get('kind') !== 'all') ||
      searchParams.get('year_min') ||
      searchParams.get('year_max') ||
      searchParams.get('father') ||
      searchParams.get('mother') ||
      searchParams.get('child') ||
      searchParams.get('spouse') ||
      (searchParams.get('role') && searchParams.get('role') !== 'all')
    );
  });

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
    (archive !== 'all' ? 1 : 0) +
    (place.trim() ? 1 : 0) +
    (kind !== 'all' ? 1 : 0) +
    (yearMin.trim() ? 1 : 0) +
    (yearMax.trim() ? 1 : 0) +
    (father.trim() ? 1 : 0) +
    (mother.trim() ? 1 : 0) +
    (child.trim() ? 1 : 0) +
    (spouse.trim() ? 1 : 0) +
    (role !== 'all' ? 1 : 0) +
    (!fuzzy ? 1 : 0) +
    (!namesOnly ? 1 : 0);

  const clearAllFilters = () => {
    setArchive('all');
    setPlace('');
    setKind('all');
    setYearMin('');
    setYearMax('');
    setFather('');
    setMother('');
    setChild('');
    setSpouse('');
    setRole('all');
    setFuzzy(true);
    setNamesOnly(true);
    setSearchParams(query.trim() ? { q: query.trim() } : {}, { replace: true });
  };

  const updateUrlParams = (qVal, archiveVal, placeVal, kindVal, minVal, maxVal, fatherVal, motherVal, childVal, spouseVal, roleVal, fuzzyVal, namesOnlyVal) => {
    const params = new URLSearchParams();
    if (qVal) params.set('q', qVal);
    if (archiveVal !== 'all') params.set('archive', archiveVal);
    if (placeVal) params.set('place', placeVal);
    if (kindVal !== 'all') params.set('kind', kindVal);
    if (minVal) params.set('year_min', minVal);
    if (maxVal) params.set('year_max', maxVal);
    if (fatherVal) params.set('father', fatherVal);
    if (motherVal) params.set('mother', motherVal);
    if (childVal) params.set('child', childVal);
    if (spouseVal) params.set('spouse', spouseVal);
    if (roleVal !== 'all') params.set('role', roleVal);
    if (!fuzzyVal) params.set('fuzzy', 'false');
    if (!namesOnlyVal) params.set('names_only', 'false');
    setSearchParams(params, { replace: true });
  };

  const run = async (e) => {
    if (e) e.preventDefault();
    const q = query.trim();
    if ((!q && activeFilterCount === 0) || loading) return;

    updateUrlParams(q, archive, place.trim(), kind, yearMin.trim(), yearMax.trim(), father.trim(), mother.trim(), child.trim(), spouse.trim(), role, fuzzy, namesOnly);

    setLoading(true);
    setError(null);
    try {
      const token = await getIdToken();
      if (!token) {
        setError('Could not obtain an identity token. Sign out and back in.');
        return;
      }

      let url = `${ADMIN_API_BASE_URL}/api/v1/admin/query?q=${encodeURIComponent(q)}&limit=25`;
      if (archive !== 'all') url += `&archive=${encodeURIComponent(archive)}`;
      if (place.trim()) url += `&place=${encodeURIComponent(place.trim())}`;
      if (kind !== 'all') url += `&kind=${encodeURIComponent(kind)}`;
      if (yearMin.trim() && !isNaN(parseInt(yearMin))) url += `&year_min=${parseInt(yearMin)}`;
      if (yearMax.trim() && !isNaN(parseInt(yearMax))) url += `&year_max=${parseInt(yearMax)}`;
      if (father.trim()) url += `&father=${encodeURIComponent(father.trim())}`;
      if (mother.trim()) url += `&mother=${encodeURIComponent(mother.trim())}`;
      if (child.trim()) url += `&child=${encodeURIComponent(child.trim())}`;
      if (spouse.trim()) url += `&spouse=${encodeURIComponent(spouse.trim())}`;
      if (role !== 'all') url += `&role=${encodeURIComponent(role)}`;
      if (!fuzzy) url += `&fuzzy=false`;
      if (!namesOnly) url += `&names_only=false`;

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

  useEffect(() => {
    const hasUrlParams = Boolean(
      searchParams.get('q') ||
      (searchParams.get('archive') && searchParams.get('archive') !== 'all') ||
      searchParams.get('place') ||
      (searchParams.get('kind') && searchParams.get('kind') !== 'all') ||
      searchParams.get('year_min') ||
      searchParams.get('year_max') ||
      searchParams.get('father') ||
      searchParams.get('mother') ||
      searchParams.get('child') ||
      searchParams.get('spouse') ||
      (searchParams.get('role') && searchParams.get('role') !== 'all')
    );
    if (hasUrlParams) {
      run();
    }
  }, []);

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
          className={`h-7 inline-flex items-center gap-1.5 px-2.5 rounded-md border text-xs leading-none transition-colors cursor-pointer shrink-0 ${
            showFilters || activeFilterCount > 0
              ? 'bg-accent/10 border-accent/40 text-accent font-semibold'
              : 'bg-surface border-border text-secondary hover:text-primary'
          }`}
        >
          <SlidersHorizontal size={13} className="shrink-0" />
          <span className="leading-none">Filters</span>
          {activeFilterCount > 0 && (
            <span className="w-3.5 h-3.5 rounded-full bg-accent text-on-accent text-[9px] font-bold inline-flex items-center justify-center shrink-0 ml-0.5 leading-none pt-[1px]">
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
            placeholder='Search main name or query with inline syntax (e.g. "Jan de Vries place:Leeuwarden year:1840..1860 type:birth archive:arg")'
            className="input-field flex-1 text-[13px]"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={loading || (!query.trim() && activeFilterCount === 0)}
            className="px-5 rounded-lg bg-accent text-on-accent text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40 flex items-center gap-2"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            Search
          </button>
        </div>

        {/* Expandable Filter Drawer */}
        {showFilters && (
          <div className="bg-surface/60 border border-border/80 rounded-lg p-4 space-y-4 animate-in fade-in duration-150">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Archive Code Selector */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                  Archive / Institution
                </label>
                <select
                  value={archive}
                  onChange={(e) => setArchive(e.target.value)}
                  className="w-full bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-primary font-medium focus:border-accent shadow-xs"
                >
                  <option value="all">All Archives</option>
                  <option value="arg">Archief Eemland (ARG)</option>
                  <option value="ade">Archief Delft (ADE)</option>
                  <option value="frl">Tresoar Fryslân (FRL)</option>
                  <option value="gra">Groninger Archieven (GRA)</option>
                  <option value="bda">Stadsarchief Breda (BDA)</option>
                  <option value="dor">Dordrechts Archief (DOR)</option>
                  <option value="shv">Streekarchief Goeree-Overflakkee (SHV)</option>
                  <option value="cod">CODA Apeldoorn (COD)</option>
                </select>
              </div>

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

            {/* Relational Family & Person Filters */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 pt-2 border-t border-border/40">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                  Father's Name
                </label>
                <input
                  type="text"
                  value={father}
                  onChange={(e) => setFather(e.target.value)}
                  placeholder="e.g. Jacob"
                  className="w-full bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-primary focus:border-accent shadow-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                  Mother's Name
                </label>
                <input
                  type="text"
                  value={mother}
                  onChange={(e) => setMother(e.target.value)}
                  placeholder="e.g. Jacoba"
                  className="w-full bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-primary focus:border-accent shadow-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                  Spouse / Partner
                </label>
                <input
                  type="text"
                  value={spouse}
                  onChange={(e) => setSpouse(e.target.value)}
                  placeholder="e.g. van Zwieten"
                  className="w-full bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-primary focus:border-accent shadow-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                  Child / Subject
                </label>
                <input
                  type="text"
                  value={child}
                  onChange={(e) => setChild(e.target.value)}
                  placeholder="e.g. Klasina"
                  className="w-full bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-primary focus:border-accent shadow-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                  Subject Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-primary font-medium focus:border-accent shadow-xs"
                >
                  <option value="all">Any Role</option>
                  <option value="child">Child (Kind / Dopeling)</option>
                  <option value="father">Father (Vader)</option>
                  <option value="mother">Mother (Moeder)</option>
                  <option value="spouse">Spouse / Partner (Bruidegom / Bruid / Relatie)</option>
                  <option value="deceased">Deceased (Overledene)</option>
                  <option value="witness">Witness (Getuige)</option>
                </select>
              </div>
            </div>

            {/* Search Toggles & Presets */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/40 flex-wrap">
              <div className="flex items-center gap-4 flex-wrap text-xs text-primary">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={fuzzy}
                    onChange={(e) => setFuzzy(e.target.checked)}
                    className="rounded border-border text-accent focus:ring-accent"
                  />
                  <span>Phonetic variants</span>
                  <div className="group relative inline-flex items-center">
                    <HelpCircle size={12} className="text-secondary/70 hover:text-accent cursor-help transition-colors" />
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block w-56 p-2 bg-card border border-border-strong rounded-md shadow-xl text-[11px] text-secondary font-normal normal-case z-50 leading-relaxed">
                      Matches sound-alike historical spelling variants (e.g. Clasina / Klasina / Klazina). Exact spellings are always ranked first.
                    </div>
                  </div>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={namesOnly}
                    onChange={(e) => setNamesOnly(e.target.checked)}
                    className="rounded border-border text-accent focus:ring-accent"
                  />
                  <span>Names only</span>
                  <div className="group relative inline-flex items-center">
                    <HelpCircle size={12} className="text-secondary/70 hover:text-accent cursor-help transition-colors" />
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block w-56 p-2 bg-card border border-border-strong rounded-md shadow-xl text-[11px] text-secondary font-normal normal-case z-50 leading-relaxed">
                      Restricts search strictly to person names. Unchecking this widens search to include event places, cities, and archive institutions.
                    </div>
                  </div>
                </label>
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
            {archive !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent text-[11px] font-medium uppercase font-mono">
                Archive: {archive}
                <X size={11} className="cursor-pointer hover:opacity-80" onClick={() => setArchive('all')} />
              </span>
            )}
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
            {father.trim() && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent text-[11px] font-medium">
                Father: {father.trim()}
                <X size={11} className="cursor-pointer hover:opacity-80" onClick={() => setFather('')} />
              </span>
            )}
            {mother.trim() && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent text-[11px] font-medium">
                Mother: {mother.trim()}
                <X size={11} className="cursor-pointer hover:opacity-80" onClick={() => setMother('')} />
              </span>
            )}
            {spouse.trim() && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent text-[11px] font-medium">
                Spouse: {spouse.trim()}
                <X size={11} className="cursor-pointer hover:opacity-80" onClick={() => setSpouse('')} />
              </span>
            )}
            {child.trim() && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent text-[11px] font-medium">
                Child: {child.trim()}
                <X size={11} className="cursor-pointer hover:opacity-80" onClick={() => setChild('')} />
              </span>
            )}
            {role !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent text-[11px] font-medium">
                Role: {role}
                <X size={11} className="cursor-pointer hover:opacity-80" onClick={() => setRole('all')} />
              </span>
            )}
            {!fuzzy && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[11px] font-medium">
                Exact spelling only
                <X size={11} className="cursor-pointer hover:opacity-80" onClick={() => setFuzzy(true)} />
              </span>
            )}
            {!namesOnly && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent text-[11px] font-medium">
                All document fields
                <X size={11} className="cursor-pointer hover:opacity-80" onClick={() => setNamesOnly(true)} />
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
                      className="flex items-start gap-2 text-left text-primary font-semibold break-words hover:text-accent transition-colors cursor-pointer flex-1"
                    >
                      <ChevronRight
                        size={13}
                        className={`mt-1 shrink-0 transition-transform ${
                          expanded.has(hit.id) ? 'rotate-90' : ''
                        }`}
                      />
                      {hit.persons?.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {hit.persons.map((p, i) => {
                            const isPrincipal = ['Bruidegom', 'Bruid', 'Kind', 'Overledene', 'Geregistreerde'].includes(p.r);
                            return (
                              <span
                                key={i}
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] border font-medium ${
                                  isPrincipal
                                    ? 'bg-accent/15 border-accent/40 text-accent'
                                    : 'bg-muted/60 border-border/60 text-primary/80'
                                }`}
                              >
                                <span>{p.n}</span>
                                {p.r && <span className="text-[10px] opacity-75 font-mono">({p.r})</span>}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span>{hit.names}</span>
                      )}
                    </button>
                    {hit.url && (
                      <a
                        href={hit.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="shrink-0 text-accent hover:underline inline-flex items-center gap-1 mt-0.5"
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
