import React, { useState } from 'react';
import { Database, Loader2, HelpCircle, X } from 'lucide-react';

/**
 * What each record-type code means.
 *
 * BS = Burgerlijke Stand, civil registration from 1811.
 * DTB = Doop-, Trouw- en Begraafboeken, the church registers that precede it.
 *
 * Verified against the live index by reading the EVENT_TYPE of real documents
 * rather than inferred from the abbreviations — `dtb_b`/`dtb_d` are easy to
 * transpose (Begraven vs Doop) and getting them backwards would mislabel every
 * burial as a baptism.
 */
const KIND_LABELS = {
  bsg: 'Civil birth register (1811 onwards)',
  bsh: 'Civil marriage register (1811 onwards)',
  bso: 'Civil death register (1811 onwards)',
  bev: 'Population register — households and residents',
  dtb_d: 'Church baptism register (generally pre-1811)',
  dtb_t: 'Church marriage register (generally pre-1811)',
  dtb_b: 'Church burial register (generally pre-1811)',
  not: 'Notarial deeds — wills, estates, contracts',
};

const KIND_SHORT = {
  bsg: 'Births', bsh: 'Marriages', bso: 'Deaths', bev: 'Population',
  dtb_d: 'Baptisms', dtb_t: 'Marriages (church)', dtb_b: 'Burials', not: 'Notarial',
};

/**
 * Codes explained in a panel rather than only in `title` attributes.
 *
 * A `title` tooltip needs a mouse to hover, so on a phone the abbreviations are
 * simply unexplained. This opens on tap and covers both vocabularies at once.
 */
const Glossary = ({ archives, onClose }) => (
  <div className="border border-border rounded-lg p-4 mb-5 bg-muted/30">
    <div className="flex items-start justify-between gap-3 mb-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">
        What the codes mean
      </p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close explanation"
        className="text-secondary hover:text-primary transition-colors cursor-pointer shrink-0"
      >
        <X size={14} />
      </button>
    </div>

    <p className="text-[10px] font-bold uppercase tracking-widest text-secondary/70 mb-1.5">
      Archives
    </p>
    <ul className="space-y-1 mb-4">
      {archives.length === 0 && (
        <li className="text-xs text-secondary italic">Nothing harvested yet.</li>
      )}
      {archives.map((row) => (
        <li key={row.archive} className="flex gap-2 text-xs">
          <span className="text-primary shrink-0 w-12">{row.archive}</span>
          <span className="text-secondary">{row.institution || 'Name not recorded'}</span>
        </li>
      ))}
    </ul>

    <p className="text-[10px] font-bold uppercase tracking-widest text-secondary/70 mb-1.5">
      Record types
    </p>
    <ul className="space-y-1">
      {Object.entries(KIND_LABELS).map(([kind, label]) => (
        <li key={kind} className="flex gap-2 text-xs">
          <span className="text-primary shrink-0 w-12">{kind}</span>
          <span className="text-secondary">{label}</span>
        </li>
      ))}
    </ul>

    <p className="text-[10px] text-secondary/60 mt-3">
      BS = Burgerlijke Stand, civil registration from 1811. DTB = Doop-, Trouw- en
      Begraafboeken, the church registers that precede it.
    </p>
  </div>
);

/**
 * How much of Open Archieven we actually hold.
 *
 * Coverage is per archive, so this is the honest answer to "why did that search
 * find nothing" — usually not a bug, just an archive that has not been harvested.
 * It is also what decides when the research tools should fall back to the live
 * API instead of trusting an empty local result.
 */
const ArchiveCoverage = ({ coverage }) => {
  const [showGlossary, setShowGlossary] = useState(false);

  if (!coverage) {
    return (
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-2 text-xs text-secondary">
          <Loader2 size={13} className="animate-spin" />
          Reading index coverage…
        </div>
      </div>
    );
  }

  const total = coverage.total_records || 0;
  const archives = coverage.by_archive || [];
  const topArchive = archives[0]?.records || 1;

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Database size={14} className="text-secondary" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-secondary">
            Records
          </span>
          <button
            type="button"
            onClick={() => setShowGlossary((open) => !open)}
            aria-expanded={showGlossary}
            aria-label="Explain the archive and record type codes"
            className={`transition-colors cursor-pointer ${
              showGlossary ? 'text-accent' : 'text-secondary/60 hover:text-accent'
            }`}
          >
            <HelpCircle size={13} />
          </button>
        </div>
        {/* No "indexing" badge here: the Indexing panel above this one owns
            that state, and in more detail than a single word could carry. */}
        <span className="font-serif text-3xl text-primary leading-none">
          {total.toLocaleString()}
        </span>
      </div>

      {showGlossary && (
        <Glossary archives={archives} onClose={() => setShowGlossary(false)} />
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-secondary/70 mb-2">
            By archive
          </p>
          <ul className="space-y-1.5">
            {archives.slice(0, 10).map((row) => (
              <li key={row.archive} className="text-xs">
                <div className="flex justify-between gap-2 mb-0.5">
                  <span
                    className="text-primary cursor-help"
                    title={row.institution
                      ? `${row.archive} — ${row.institution}`
                      : `Archive code: ${row.archive}`}
                  >
                    {row.archive}
                  </span>
                  <span className="text-secondary tabular-nums">{row.records.toLocaleString()}</span>
                </div>
                <div aria-hidden="true" className="h-1 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-accent/60"
                       style={{ width: `${(row.records / topArchive) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-secondary/70 mb-2">
            By record type
          </p>
          <ul className="space-y-1.5">
            {(coverage.by_kind || []).map((row) => (
              <li key={row.kind} className="flex justify-between gap-2 text-xs" title={KIND_LABELS[row.kind] || row.kind}>
                <span className="text-secondary cursor-help">
                  <span className="text-primary/80">{row.kind}</span>
                  {KIND_SHORT[row.kind] && <span className="ml-2">{KIND_SHORT[row.kind]}</span>}
                </span>
                <span className="text-secondary tabular-nums shrink-0">{row.records.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ArchiveCoverage;
