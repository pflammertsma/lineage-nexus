import React from 'react';
import { Loader2, PieChart } from 'lucide-react';
import { getArchiveName } from '../config';
import { getArchiveColor } from './CorpusGrowthChart';
import DonutChart from './DonutChart';

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

const KIND_COLORS = {
  bev: '#10B981',   // Population - Emerald
  bsg: '#3B82F6',   // Births - Blue
  bso: '#6366F1',   // Deaths - Indigo
  not: '#F97316',   // Notarial - Orange
  dtb_d: '#06B6D4', // Baptisms - Cyan
  bsh: '#EC4899',   // Marriages - Pink
  dtb_t: '#F59E0B', // Church Marriages - Amber
  dtb_b: '#8B5CF6', // Burials - Purple
};

/**
 * Detailed Corpus Coverage Breakdown with Progress Bars and Donut Charts.
 * Provides interactive tooltips explaining archive and record type codes on hover with dotted underline styling.
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
  const archives = coverage.by_archive || [];
  const topArchive = archives[0]?.records || 1;
  const kinds = coverage.by_kind || [];
  const topKind = kinds[0]?.records || 1;

  // Prepare Pie Chart Data with descriptions for DonutChart tooltips
  const archivePieData = archives.map((row, idx) => ({
    label: getArchiveName(row.archive),
    value: row.records,
    color: getArchiveColor(idx),
    description: row.institution ? `${row.archive.toUpperCase()} — ${row.institution}` : getArchiveName(row.archive),
  }));

  const kindPieData = kinds.map((row, idx) => ({
    label: KIND_SHORT[row.kind] || row.kind.toUpperCase(),
    value: row.records,
    color: KIND_COLORS[row.kind] || getArchiveColor(idx + 5),
    description: KIND_LABELS[row.kind] ? `${row.kind}: ${KIND_LABELS[row.kind]}` : row.kind,
  }));

  return (
    <div className="space-y-6">
      {/* Section 1: Records by Type */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <PieChart size={14} className="text-secondary shrink-0" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">
            Records by Type
          </p>
        </div>

        <div className="grid gap-6 grid-cols-1 lg:grid-cols-12 items-start">
          {/* Left: Progress List */}
          <div className="lg:col-span-7">
            <ul className="space-y-2">
              {kinds.map((row, idx) => {
                const color = KIND_COLORS[row.kind] || getArchiveColor(idx + 5);
                const fullDescription = KIND_LABELS[row.kind] || row.kind;
                return (
                  <li key={row.kind} className="text-xs">
                    <div className="flex justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                        <div className="group relative inline-flex items-center">
                          <span
                            className="font-mono text-[10px] text-accent font-bold shrink-0 border-b border-dotted border-accent/60 cursor-help"
                            title={fullDescription}
                          >
                            {row.kind}
                          </span>
                          {/* Floating Tooltip Bubble */}
                          <div className="pointer-events-none absolute left-0 bottom-full mb-1.5 hidden group-hover:block z-30 w-64 p-2.5 rounded-lg bg-surface border border-border text-primary text-xs shadow-xl transition-opacity duration-150">
                            <p className="font-mono font-bold text-accent text-[11px] mb-0.5">{row.kind}</p>
                            <p className="text-secondary text-xs leading-normal">{fullDescription}</p>
                          </div>
                        </div>
                        <span className="text-secondary truncate">{KIND_SHORT[row.kind] || row.kind}</span>
                      </div>
                      <span className="text-secondary font-mono tabular-nums shrink-0">{row.records.toLocaleString()}</span>
                    </div>
                    <div aria-hidden="true" className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${(row.records / topKind) * 100}%`,
                          background: color,
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Right: Pie Chart */}
          <div className="lg:col-span-5 w-full flex justify-center">
            <DonutChart data={kindPieData} totalValue={total} title="Record Types" />
          </div>
        </div>
      </div>

      {/* Section 2: Records by Archive */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <PieChart size={14} className="text-secondary shrink-0" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">
            Records by Archive
          </p>
        </div>

        <div className="grid gap-6 grid-cols-1 lg:grid-cols-12 items-start">
          {/* Left: Progress List */}
          <div className="lg:col-span-7">
            <ul className="space-y-2">
              {archives.map((row, idx) => {
                const archiveName = getArchiveName(row.archive);
                const institution = row.institution || archiveName;
                return (
                  <li key={row.archive} className="text-xs">
                    <div className="flex justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getArchiveColor(idx) }} />
                        <div className="group relative inline-flex items-center">
                          <span
                            className="font-mono text-[10px] text-secondary font-bold shrink-0 border-b border-dotted border-secondary/60 cursor-help"
                            title={institution}
                          >
                            {row.archive.toUpperCase()}
                          </span>
                          {/* Floating Tooltip Bubble */}
                          <div className="pointer-events-none absolute left-0 bottom-full mb-1.5 hidden group-hover:block z-30 w-72 p-2.5 rounded-lg bg-surface border border-border text-primary text-xs shadow-xl transition-opacity duration-150">
                            <p className="font-mono font-bold text-accent text-[11px] mb-0.5">{row.archive.toUpperCase()}</p>
                            <p className="text-secondary text-xs leading-normal">{institution}</p>
                          </div>
                        </div>
                        <span className="truncate text-primary font-medium">{archiveName}</span>
                      </div>
                      <span className="text-secondary font-mono tabular-nums shrink-0">{row.records.toLocaleString()}</span>
                    </div>
                    <div aria-hidden="true" className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${(row.records / topArchive) * 100}%`,
                          background: getArchiveColor(idx),
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Right: Pie Chart */}
          <div className="lg:col-span-5 w-full flex justify-center">
            <DonutChart data={archivePieData} totalValue={total} title="Archives" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArchiveCoverage;
