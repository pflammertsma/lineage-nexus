import React from 'react';
import { Database, Loader2 } from 'lucide-react';

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
 * How much of Open Archieven we actually hold.
 *
 * Coverage is per archive, so this is the honest answer to "why did that search
 * find nothing" — usually not a bug, just an archive that has not been harvested.
 * It is also what decides when the research tools should fall back to the live
 * API instead of trusting an empty local result.
 */
const ArchiveCoverage = ({ coverage }) => {
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
  const topArchive = coverage.by_archive?.[0]?.records || 1;

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Database size={14} className="text-secondary" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-secondary">
            Records held
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-3xl text-primary leading-none">
            {total.toLocaleString()}
          </span>
          {coverage.is_indexing && (
            <span className="text-[10px] text-amber-500 uppercase tracking-widest">
              indexing…
            </span>
          )}
        </div>
      </div>

      <p className="text-xs text-secondary mb-5">
        Across {coverage.archive_count} archive{coverage.archive_count === 1 ? '' : 's'}.
        Anything not held here is answered live from Open Archieven instead.
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-secondary/70 mb-2">
            By archive
          </p>
          <ul className="space-y-1.5">
            {(coverage.by_archive || []).slice(0, 10).map((row) => (
              <li key={row.archive} className="text-xs">
                <div className="flex justify-between gap-2 mb-0.5">
                  <span className="font-mono text-primary">{row.archive}</span>
                  <span className="text-secondary font-mono">{row.records.toLocaleString()}</span>
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
                  <span className="font-mono text-primary/80">{row.kind}</span>
                  {KIND_SHORT[row.kind] && <span className="ml-2">{KIND_SHORT[row.kind]}</span>}
                </span>
                <span className="text-secondary font-mono shrink-0">{row.records.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ArchiveCoverage;
