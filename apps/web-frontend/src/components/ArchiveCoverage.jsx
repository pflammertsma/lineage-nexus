import React, { useState } from 'react';
import { Database, Loader2, HelpCircle, X, PieChart } from 'lucide-react';
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
          <span className="text-primary shrink-0 w-12 font-mono font-bold">{row.archive}</span>
          <span className="text-secondary">{row.institution || getArchiveName(row.archive)}</span>
        </li>
      ))}
    </ul>

    <p className="text-[10px] font-bold uppercase tracking-widest text-secondary/70 mb-1.5">
      Record types
    </p>
    <ul className="space-y-1">
      {Object.entries(KIND_LABELS).map(([kind, label]) => (
        <li key={kind} className="flex gap-2 text-xs">
          <span className="text-primary shrink-0 w-12 font-mono font-bold">{kind}</span>
          <span className="text-secondary">{label}</span>
        </li>
      ))}
    </ul>
  </div>
);

/**
 * Detailed Corpus Coverage Breakdown with Progress Bars and Pie Charts.
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
  const kinds = coverage.by_kind || [];
  const topKind = kinds[0]?.records || 1;

  // Prepare Pie Chart Data
  const archivePieData = archives.map((row, idx) => ({
    label: getArchiveName(row.archive),
    value: row.records,
    color: getArchiveColor(idx),
  }));

  const kindPieData = kinds.map((row, idx) => ({
    label: KIND_SHORT[row.kind] || row.kind.toUpperCase(),
    value: row.records,
    color: KIND_COLORS[row.kind] || getArchiveColor(idx + 5),
  }));

  return (
    <div className="space-y-6">
      {/* Header Summary Card */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Database size={14} className="text-secondary" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-secondary">
              Total Corpus Records
            </span>
            <button
              type="button"
              onClick={() => setShowGlossary((open) => !open)}
              aria-expanded={showGlossary}
              aria-label="Explain the archive and record type codes"
              className={`transition-colors cursor-pointer ${showGlossary ? 'text-accent' : 'text-secondary/60 hover:text-accent'
                }`}
            >
              <HelpCircle size={13} />
            </button>
          </div>
          <span className="font-serif text-3xl text-primary leading-none">
            {total.toLocaleString()}
          </span>
        </div>

        {showGlossary && (
          <div className="mt-4">
            <Glossary archives={archives} onClose={() => setShowGlossary(false)} />
          </div>
        )}
      </div>

      {/* Grid Section 2: By Record Type Breakdown */}
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
                return (
                  <li key={row.kind} className="text-xs">
                    <div className="flex justify-between gap-2 mb-1">
                      <span
                        className="text-primary font-medium cursor-help flex items-center gap-1.5 truncate"
                        title={KIND_LABELS[row.kind] || row.kind}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                        <span className="font-mono text-[10px] text-accent font-bold shrink-0">{row.kind}</span>
                        <span className="text-secondary truncate">{KIND_SHORT[row.kind] || row.kind}</span>
                      </span>
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

      {/* Grid Section 1: By Archive Breakdown */}
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
              {archives.map((row, idx) => (
                <li key={row.archive} className="text-xs">
                  <div className="flex justify-between gap-2 mb-1">
                    <span
                      className="text-primary font-medium cursor-help flex items-center gap-1.5 truncate"
                      title={row.institution ? `${row.archive} — ${row.institution}` : getArchiveName(row.archive)}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getArchiveColor(idx) }} />
                      <span className="truncate">{getArchiveName(row.archive)}</span>
                      <span className="text-[10px] font-mono text-secondary shrink-0">({row.archive.toUpperCase()})</span>
                    </span>
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
              ))}
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
