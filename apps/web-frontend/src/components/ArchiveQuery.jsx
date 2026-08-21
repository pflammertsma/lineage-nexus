import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ExternalLink, Loader2, ChevronRight, SlidersHorizontal, MapPin, X, HelpCircle, UserPlus, Plus } from 'lucide-react';
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
const INLINE_RE = /\b(place|loc|location|date|year|type|kind|archive|father|mother|child|spouse|role):([^\s]+)/i;

const TUSSENVOEGSELS = new Set([
  'van', 'de', 'der', 'den', 'ter', 'te', 'het', 'op', 'aan', 'uit', 'in',
  "'t", 't', 'du', 'la', 'le', 'von', 'vd', 'd', 'z'
]);

const ROLE_PATTERNS = {
  father: /vader|father/i,
  mother: /moeder|mother/i,
  spouse: /bruid|bruidegom|echtgenoot|echtgenote|partner|spouse/i,
  child: /kind|dopeling|overledene|geregistreerde|child/i,
  witness: /getuige|witness/i,
};

function isRoleMatch(personRole, targetRole) {
  if (!personRole || !targetRole) return false;
  const pattern = ROLE_PATTERNS[targetRole];
  return pattern ? pattern.test(personRole) : false;
}

/**
 * Phonetic key generator for client-side search term highlighting.
 */
function toPhoneticKey(str) {
  if (!str) return '';
  let s = str.toLowerCase().normalize('NFKD').replace(/[^a-z]/g, '');
  s = s.replace(/(en|e)$/, '');
  s = s.replace(/ph/g, 'f').replace(/th/g, 't').replace(/gh/g, 'g');
  s = s.replace(/ck/g, 'k').replace(/sch/g, 'sk').replace(/ch/g, 'g');
  s = s.replace(/c(?=[eiyj])/g, 's').replace(/c/g, 'k').replace(/q/g, 'k').replace(/x/g, 'ks');
  s = s.replace(/w/g, 'v').replace(/v/g, 'f');
  s = s.replace(/ij/g, 'i').replace(/y/g, 'i').replace(/ie/g, 'i');
  s = s.replace(/ae/g, 'a').replace(/aa/g, 'a').replace(/ee/g, 'e');
  s = s.replace(/oo/g, 'o').replace(/uu/g, 'u').replace(/oe/g, 'u');
  s = s.replace(/z/g, 's');
  s = s.replace(/j$/, 'i');
  s = s.replace(/(.)\1+/g, '$1');
  return s;
}

/**
 * Highlights individual words in a person's name that match search query terms.
 */
function renderHighlightedName(name, personRole, globalTokens = [], roleScopedTokens = []) {
  if (!name) {
    return { rendered: name, hasMatch: false };
  }

  // Combine globalTokens + roleScopedTokens that match personRole
  const applicableTokens = [...globalTokens];
  if (personRole && roleScopedTokens && roleScopedTokens.length > 0) {
    roleScopedTokens.forEach(({ role, tokens }) => {
      if (isRoleMatch(personRole, role)) {
        applicableTokens.push(...tokens);
      }
    });
  }

  if (applicableTokens.length === 0) {
    return { rendered: name, hasMatch: false };
  }

  const parts = name.split(/(\s+|-)/);
  let hasAnyMatch = false;

  const rendered = parts.map((part, idx) => {
    const rawClean = part.toLowerCase().replace(/['`"]/g, '').trim();
    // Ignore tussenvoegsels (van, 't, de, etc.) and tiny tokens
    if (!rawClean || TUSSENVOEGSELS.has(rawClean) || TUSSENVOEGSELS.has(part.toLowerCase().trim()) || rawClean.length < 2) {
      return part;
    }

    const partClean = part.toLowerCase().replace(/[^a-z0-9]/g, '');
    const partPhonetic = toPhoneticKey(part);

    const isMatch = applicableTokens.some((tok) => {
      const tokClean = tok.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!tokClean || TUSSENVOEGSELS.has(tokClean) || tokClean.length < 2) return false;

      // 1. Literal exact token match (e.g. Spruijt == Spruijt)
      if (partClean === tokClean) return true;

      // 2. Exact phonetic match (e.g. Klazina == Clasina, Spruijt == Spruit)
      const tokPhonetic = toPhoneticKey(tokClean);
      if (partPhonetic && tokPhonetic && partPhonetic === tokPhonetic) {
        return true;
      }

      // 3. Patronymic suffix match ('s' suffix on root name, length >= 4)
      if (tokClean.length >= 4 && partClean.length >= 4) {
        if (partClean === tokClean + 's' || tokClean === partClean + 's') {
          return true;
        }
      }

      return false;
    });

    if (isMatch) {
      hasAnyMatch = true;
      return (
        <mark
          key={idx}
          className="bg-amber-500/30 font-bold px-0.5 rounded"
          style={{ backgroundColor: 'rgba(245, 158, 11, 0.28)', color: '#fef08a' }}
        >
          {part}
        </mark>
      );
    }

    return part;
  });

  return { rendered, hasMatch: hasAnyMatch };
}

const parseInlineTokens = (qStr) => {
  if (!qStr) return { cleanQ: '', tokens: {} };
  const tokens = {};
  const cleanParts = [];

  for (const part of qStr.split(/\s+/)) {
    const match = part.match(INLINE_RE);
    if (match) {
      const key = match[1].toLowerCase();
      const val = match[2].trim();
      if (['place', 'loc', 'location'].includes(key)) tokens.place = val.replace(/_/g, ' ');
      else if (key === 'archive') tokens.archive = val;
      else if (['type', 'kind'].includes(key)) tokens.kind = val;
      else if (key === 'father') tokens.father = val.replace(/_/g, ' ');
      else if (key === 'mother') tokens.mother = val.replace(/_/g, ' ');
      else if (key === 'child') tokens.child = val.replace(/_/g, ' ');
      else if (key === 'spouse') tokens.spouse = val.replace(/_/g, ' ');
      else if (key === 'role') tokens.role = val.toLowerCase();
      else if (['date', 'year'].includes(key)) {
        if (val.startsWith('>=')) tokens.yearMin = val.slice(2);
        else if (val.startsWith('<=')) tokens.yearMax = val.slice(2);
        else if (val.includes('..')) {
          const [min, max] = val.split('..');
          if (min) tokens.yearMin = min;
          if (max) tokens.yearMax = max;
        } else {
          tokens.yearMin = val;
          tokens.yearMax = val;
        }
      }
    } else {
      cleanParts.push(part);
    }
  }
  return { cleanQ: cleanParts.join(' '), tokens };
};

const buildFullQueryString = (baseQ, { archive, place, kind, yearMin, yearMax, relatives, role }) => {
  const parts = [];
  const clean = baseQ ? parseInlineTokens(baseQ).cleanQ.trim() : '';
  if (clean) parts.push(clean);

  if (archive && archive !== 'all') parts.push(`archive:${archive}`);
  if (kind && kind !== 'all') {
    const kShort = kind === 'bsg,dtb_d' ? 'birth' : kind === 'bsh,dtb_t' ? 'marriage' : kind === 'bso,dtb_b' ? 'death' : kind;
    parts.push(`type:${kShort}`);
  }
  if (place && place.trim()) parts.push(`place:${place.trim().replace(/\s+/g, '_')}`);
  if (yearMin.trim() || yearMax.trim()) {
    if (yearMin.trim() && yearMax.trim()) {
      if (yearMin.trim() === yearMax.trim()) parts.push(`date:${yearMin.trim()}`);
      else parts.push(`date:${yearMin.trim()}..${yearMax.trim()}`);
    } else if (yearMin.trim()) {
      parts.push(`date:>=${yearMin.trim()}`);
    } else if (yearMax.trim()) {
      parts.push(`date:<=${yearMax.trim()}`);
    }
  }
  if (relatives && relatives.length > 0) {
    relatives.forEach((rel) => {
      if (rel.name && rel.name.trim()) {
        const rRole = rel.role || 'father';
        parts.push(`${rRole}:${rel.name.trim().replace(/\s+/g, '_')}`);
      }
    });
  }
  if (role && role !== 'all') parts.push(`role:${role}`);

  return parts.join(' ');
};

const ArchiveQuery = ({ getIdToken }) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [query, setQuery] = useState(() => searchParams.get('q') || '');
  const [archive, setArchive] = useState(() => searchParams.get('archive') || 'all');
  const [place, setPlace] = useState(() => searchParams.get('place') || '');
  const [kind, setKind] = useState(() => searchParams.get('kind') || 'all');
  const [yearMin, setYearMin] = useState(() => searchParams.get('year_min') || '');
  const [yearMax, setYearMax] = useState(() => searchParams.get('year_max') || '');
  const [role, setRole] = useState(() => searchParams.get('role') || 'all');
  const [fuzzy, setFuzzy] = useState(() => searchParams.get('fuzzy') !== 'false');
  const [namesOnly, setNamesOnly] = useState(() => searchParams.get('names_only') !== 'false');

  const [relatives, setRelatives] = useState(() => {
    const list = [];
    if (searchParams.get('father')) list.push({ id: 'f_init', role: 'father', name: searchParams.get('father') });
    if (searchParams.get('mother')) list.push({ id: 'm_init', role: 'mother', name: searchParams.get('mother') });
    if (searchParams.get('spouse')) list.push({ id: 's_init', role: 'spouse', name: searchParams.get('spouse') });
    if (searchParams.get('child')) list.push({ id: 'c_init', role: 'child', name: searchParams.get('child') });
    return list;
  });

  const addRelative = (roleType = 'father', nameVal = '') => {
    setRelatives((prev) => [...prev, { id: `${roleType}_${Date.now()}_${Math.random()}`, role: roleType, name: nameVal }]);
    setShowFilters(true);
  };

  const updateRelative = (id, field, value) => {
    setRelatives((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const removeRelative = (id) => {
    setRelatives((prev) => prev.filter((r) => r.id !== id));
  };

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
    relatives.filter((r) => r.name && r.name.trim()).length +
    (role !== 'all' ? 1 : 0) +
    (!fuzzy ? 1 : 0) +
    (!namesOnly ? 1 : 0);

  const clearAllFilters = () => {
    setArchive('all');
    setPlace('');
    setKind('all');
    setYearMin('');
    setYearMax('');
    setRelatives([]);
    setRole('all');
    setFuzzy(true);
    setNamesOnly(true);
    const clean = parseInlineTokens(query).cleanQ;
    setQuery(clean);
    setSearchParams(clean ? { q: clean } : {}, { replace: true });
  };

  const updateUrlParams = (fullQ) => {
    const params = new URLSearchParams();
    if (fullQ) params.set('q', fullQ);
    if (!fuzzy) params.set('fuzzy', 'false');
    if (!namesOnly) params.set('names_only', 'false');
    setSearchParams(params, { replace: true });
  };

  const run = async (e) => {
    if (e) e.preventDefault();
    const rawQ = query.trim();

    const { cleanQ, tokens } = parseInlineTokens(rawQ);
    const effArchive = tokens.archive || archive;
    const effPlace = tokens.place || place.trim();
    const effKind = tokens.kind || kind;
    const effYearMin = tokens.yearMin || yearMin.trim();
    const effYearMax = tokens.yearMax || yearMax.trim();
    const effRole = tokens.role || role;

    let effRelatives = relatives;
    if (tokens.relatives && tokens.relatives.length > 0) {
      effRelatives = tokens.relatives.map((r, idx) => ({
        id: `inline_${idx}_${Date.now()}`,
        role: r.role,
        name: r.name,
      }));
      setRelatives(effRelatives);
    }

    // Build unified full query string showing exact search syntax
    const fullQuery = buildFullQueryString(cleanQ, {
      archive: effArchive,
      place: effPlace,
      kind: effKind,
      yearMin: effYearMin,
      yearMax: effYearMax,
      relatives: effRelatives,
      role: effRole,
    });

    if (fullQuery !== query) {
      setQuery(fullQuery);
    }
    updateUrlParams(fullQuery);

    if (!fullQuery || loading) return;

    setLoading(true);
    setError(null);
    try {
      const token = await getIdToken();
      if (!token) {
        setError('Could not obtain an identity token. Sign out and back in.');
        return;
      }

      let url = `${ADMIN_API_BASE_URL}/api/v1/admin/query?q=${encodeURIComponent(fullQuery)}&limit=25`;
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

  const { globalTokens, roleScopedTokens } = React.useMemo(() => {
    const rawQ = query.trim();
    const { cleanQ, tokens } = parseInlineTokens(rawQ);

    const gTokens = cleanQ ? cleanQ.split(/\s+/).filter((t) => t.length >= 2) : [];
    const rScoped = [];

    if (tokens.relatives) {
      tokens.relatives.forEach((r) => {
        const tokList = r.name ? r.name.split(/\s+/).filter((t) => t.length >= 2) : [];
        if (tokList.length > 0) {
          rScoped.push({ role: r.role, tokens: tokList });
        }
      });
    }

    relatives.forEach((r) => {
      if (r.name?.trim()) {
        const tokList = r.name.trim().split(/\s+/).filter((t) => t.length >= 2);
        if (tokList.length > 0) {
          rScoped.push({ role: r.role, tokens: tokList });
        }
      }
    });

    return { globalTokens: gTokens, roleScopedTokens: rScoped };
  }, [query, relatives]);

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
          className={`h-7 inline-flex items-center gap-1.5 px-2.5 rounded-md border text-xs leading-none transition-colors cursor-pointer shrink-0 ${showFilters || activeFilterCount > 0
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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

              {/* Subject Role in Record */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                  Subject Role in Record
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

              {/* Date / Year Range Filter */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                  Date / Year Range
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={yearMin}
                    onChange={(e) => setYearMin(e.target.value)}
                    placeholder="YYYY-MM-DD"
                    className="w-1/2 bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-primary focus:border-accent shadow-xs font-mono"
                  />
                  <span className="text-secondary text-xs">–</span>
                  <input
                    type="text"
                    value={yearMax}
                    onChange={(e) => setYearMax(e.target.value)}
                    placeholder="YYYY-MM-DD"
                    className="w-1/2 bg-card border border-border rounded-md px-2.5 py-1.5 text-xs text-primary focus:border-accent shadow-xs font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Relational Family & Person Filters Dynamic Section */}
            <div className="pt-3 border-t border-border/40 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-secondary flex items-center gap-1.5">
                  <UserPlus size={13} className="text-accent" />
                  Relational Family & Persons
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => addRelative('father')}
                    className="px-2.5 py-1 rounded bg-card hover:bg-muted border border-border text-[11px] font-medium text-primary flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                  >
                    <Plus size={11} className="text-accent" /> Father
                  </button>
                  <button
                    type="button"
                    onClick={() => addRelative('mother')}
                    className="px-2.5 py-1 rounded bg-card hover:bg-muted border border-border text-[11px] font-medium text-primary flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                  >
                    <Plus size={11} className="text-accent" /> Mother
                  </button>
                  <button
                    type="button"
                    onClick={() => addRelative('spouse')}
                    className="px-2.5 py-1 rounded bg-card hover:bg-muted border border-border text-[11px] font-medium text-primary flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                  >
                    <Plus size={11} className="text-accent" /> Spouse / Partner
                  </button>
                  <button
                    type="button"
                    onClick={() => addRelative('child')}
                    className="px-2.5 py-1 rounded bg-card hover:bg-muted border border-border text-[11px] font-medium text-primary flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                  >
                    <Plus size={11} className="text-accent" /> Child
                  </button>
                  <button
                    type="button"
                    onClick={() => addRelative('witness')}
                    className="px-2.5 py-1 rounded bg-card hover:bg-muted border border-border text-[11px] font-medium text-primary flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                  >
                    <Plus size={11} className="text-accent" /> Witness / Other
                  </button>
                </div>
              </div>

              {relatives.length === 0 ? (
                <div className="text-xs text-secondary/70 italic py-1">
                  No relational filters added yet. Click a button above to specify parents, spouses, or witnesses.
                </div>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {relatives.map((rel) => (
                    <div key={rel.id} className="flex items-center gap-1.5 bg-card/80 border border-border/80 rounded-md p-1.5 shadow-xs">
                      <select
                        value={rel.role}
                        onChange={(e) => updateRelative(rel.id, 'role', e.target.value)}
                        className="bg-surface border border-border rounded px-2 py-1 text-xs text-primary font-medium focus:border-accent w-32 shrink-0"
                      >
                        <option value="father">Father</option>
                        <option value="mother">Mother</option>
                        <option value="spouse">Spouse / Partner</option>
                        <option value="child">Child</option>
                        <option value="witness">Witness</option>
                      </select>
                      <input
                        type="text"
                        value={rel.name}
                        onChange={(e) => updateRelative(rel.id, 'name', e.target.value)}
                        placeholder={`Name of ${rel.role}`}
                        className="flex-1 bg-surface border border-border rounded px-2.5 py-1 text-xs text-primary focus:border-accent"
                      />
                      <button
                        type="button"
                        onClick={() => removeRelative(rel.id)}
                        className="p-1 rounded text-secondary hover:text-red-400 hover:bg-muted/80 transition-colors cursor-pointer shrink-0"
                        title="Remove relationship filter"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
            {relatives.filter((r) => r.name && r.name.trim()).map((rel) => (
              <span key={rel.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent text-[11px] font-medium capitalize">
                {rel.role}: {rel.name.trim()}
                <X size={11} className="cursor-pointer hover:opacity-80" onClick={() => removeRelative(rel.id)} />
              </span>
            ))}
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
                        className={`mt-1 shrink-0 transition-transform ${expanded.has(hit.id) ? 'rotate-90' : ''
                          }`}
                      />
                      {hit.persons?.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {hit.persons.map((p, i) => {
                            const isPrincipal = ['Bruidegom', 'Bruid', 'Kind', 'Overledene', 'Geregistreerde'].includes(p.r);
                            const { rendered, hasMatch } = renderHighlightedName(p.n, p.r, globalTokens, roleScopedTokens);
                            return (
                              <span
                                key={i}
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] border font-medium transition-colors ${
                                  hasMatch
                                    ? 'bg-amber-500/20 border-amber-400/60 text-amber-100 shadow-xs ring-1 ring-amber-400/30'
                                    : isPrincipal
                                      ? 'bg-accent/15 border-accent/40 text-accent'
                                      : 'bg-muted/60 border-border/60 text-primary/80'
                                }`}
                              >
                                <span>{rendered}</span>
                                {p.r && <span className="text-[10px] opacity-75 font-mono">({p.r})</span>}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span>{renderHighlightedName(hit.names, null, globalTokens, roleScopedTokens).rendered}</span>
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
