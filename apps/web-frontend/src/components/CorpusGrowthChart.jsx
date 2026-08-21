import React, { useMemo, useState } from 'react';
import { Database, Filter } from 'lucide-react';
import { getArchiveName, getKindLabel, ADMIN_CHART_ARCHIVE_FILTER_STORAGE } from '../config';
import SmoothLineChart from './SmoothLineChart';

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
 * Generates an infinitely distinct, visually harmonious HSL color for any archive index
 * using the Golden Ratio (Golden Angle = 137.508°).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function getArchiveColor(index) {
  const hue = (index * 137.508) % 360;
  const saturation = 70 + (index % 3) * 8;
  const lightness = 55 + (index % 4) * 5;
  return `hsl(${hue.toFixed(1)}, ${saturation}%, ${lightness}%)`;
}

/**
 * Timeline chart tracking historical record growth over time.
 * Supports Total Corpus, Stacked Archives, Stacked Record Types, and Single Archive/Kind drilldown modes.
 */
const CorpusGrowthChart = ({ points = [], height = 200, rangeMinutes = 360, onRangeChange }) => {
  const [selectedFilter, setSelectedFilter] = useState(() => {
    try {
      return localStorage.getItem(ADMIN_CHART_ARCHIVE_FILTER_STORAGE) || 'all';
    } catch {
      return 'all';
    }
  });

  const handleFilterChange = (val) => {
    setSelectedFilter(val);
    try {
      localStorage.setItem(ADMIN_CHART_ARCHIVE_FILTER_STORAGE, val);
    } catch {
      // Ignore storage error
    }
  };

  const isStackedArchives = selectedFilter === 'stacked' || selectedFilter === 'stacked-archives';
  const isStackedKinds = selectedFilter === 'stacked-kinds';
  const isStacked = isStackedArchives || isStackedKinds;

  // Extract all distinct archive and kind codes seen in metrics
  const validPoints = useMemo(() => {
    if (selectedFilter === 'all') return points;
    return points.filter((p) => (p.archives && typeof p.archives === 'object' && Object.keys(p.archives).length > 0) || (p.kinds && typeof p.kinds === 'object' && Object.keys(p.kinds).length > 0));
  }, [points, selectedFilter]);

  const availableArchives = useMemo(() => {
    const set = new Set();
    points.forEach((p) => {
      if (p.archives && typeof p.archives === 'object') {
        Object.keys(p.archives).forEach((k) => set.add(k));
      }
    });

    const latestArchives = points[points.length - 1]?.archives || {};
    return Array.from(set).sort((a, b) => (latestArchives[b] || 0) - (latestArchives[a] || 0));
  }, [points]);

  const availableKinds = useMemo(() => {
    const set = new Set();
    points.forEach((p) => {
      if (p.kinds && typeof p.kinds === 'object') {
        Object.keys(p.kinds).forEach((k) => set.add(k));
      }
    });

    const latestKinds = points[points.length - 1]?.kinds || {};
    return Array.from(set).sort((a, b) => (latestKinds[b] || 0) - (latestKinds[a] || 0));
  }, [points]);

  // Transform raw points to include values directly on point keys
  const transformedPoints = useMemo(() => {
    return validPoints.map((p) => {
      const archivesObj = p.archives || {};
      const kindsObj = p.kinds || {};
      let value = null;

      if (selectedFilter === 'all') {
        value = typeof p.docs === 'number' ? p.docs : null;
      } else if (selectedFilter.startsWith('arch_')) {
        const archCode = selectedFilter.replace('arch_', '');
        value = typeof archivesObj[archCode] === 'number' ? archivesObj[archCode] : 0;
      } else if (selectedFilter.startsWith('kind_')) {
        const kindCode = selectedFilter.replace('kind_', '');
        value = typeof kindsObj[kindCode] === 'number' ? kindsObj[kindCode] : 0;
      } else if (selectedFilter === 'stacked' || selectedFilter === 'stacked-archives') {
        value = typeof p.docs === 'number' ? p.docs : null;
      } else if (selectedFilter === 'stacked-kinds') {
        value = typeof p.docs === 'number' ? p.docs : null;
      }

      const row = { ...p, value };
      availableArchives.forEach((code) => {
        row[`arch_${code}`] = typeof archivesObj[code] === 'number' ? archivesObj[code] : 0;
      });
      availableKinds.forEach((code) => {
        row[`kind_${code}`] = typeof kindsObj[code] === 'number' ? kindsObj[code] : 0;
      });
      return row;
    });
  }, [validPoints, selectedFilter, availableArchives, availableKinds]);

  const series = useMemo(() => {
    if (isStackedArchives) {
      return availableArchives.map((code, idx) => ({
        field: `arch_${code}`,
        label: getArchiveName(code),
        colour: getArchiveColor(idx),
        formatter: (val, hoveredPoint) => {
          const count = typeof val === 'number' ? val : 0;
          const total = hoveredPoint?.docs || 1;
          const pct = ((count / total) * 100).toFixed(1);
          return `${Math.round(count).toLocaleString()} (${pct}%)`;
        },
      }));
    }

    if (isStackedKinds) {
      return availableKinds.map((code, idx) => ({
        field: `kind_${code}`,
        label: KIND_SHORT[code] || getKindLabel(code) || code.toUpperCase(),
        colour: KIND_COLORS[code] || getArchiveColor(idx + 5),
        formatter: (val, hoveredPoint) => {
          const count = typeof val === 'number' ? val : 0;
          const total = hoveredPoint?.docs || 1;
          const pct = ((count / total) * 100).toFixed(1);
          return `${Math.round(count).toLocaleString()} (${pct}%)`;
        },
      }));
    }

    let singleLabel = 'Total Corpus';
    if (selectedFilter.startsWith('arch_')) {
      singleLabel = getArchiveName(selectedFilter.replace('arch_', ''));
    } else if (selectedFilter.startsWith('kind_')) {
      const kCode = selectedFilter.replace('kind_', '');
      singleLabel = KIND_SHORT[kCode] || getKindLabel(kCode) || kCode.toUpperCase();
    }

    return [
      {
        field: 'value',
        label: singleLabel,
        colour: 'var(--color-accent)',
        formatter: (v) => (Number.isFinite(v) ? `${Math.round(v).toLocaleString()} docs` : '—'),
      },
    ];
  }, [selectedFilter, isStackedArchives, isStackedKinds, availableArchives, availableKinds]);

  // Compute summary growth stats
  const { lastVal, growth } = useMemo(() => {
    if (!points || points.length < 2) return { lastVal: 0, growth: 0 };
    const first = points[0].docs ?? 0;
    const last = points[points.length - 1].docs ?? 0;
    return { lastVal: last, growth: last - first };
  }, [points]);

  const controls = (
    <div className="flex items-center gap-1.5 bg-surface border border-border rounded-md px-2.5 py-1 text-xs">
      <Filter size={12} className="text-secondary shrink-0" />
      <select
        value={selectedFilter}
        onChange={(e) => handleFilterChange(e.target.value)}
        className="bg-transparent text-xs text-primary font-medium focus:outline-none cursor-pointer"
      >
        <option value="all" className="bg-card text-primary font-medium py-1">
          All Corpus (Total)
        </option>
        <option value="stacked-kinds" className="bg-card text-primary font-medium py-1">
          Stacked Record Types (Breakdown)
        </option>
        <option value="stacked-archives" className="bg-card text-primary font-medium py-1">
          Stacked Archives (Breakdown)
        </option>
        {availableArchives.length > 0 && (
          <optgroup label="Single Archive" className="bg-card text-secondary font-bold not-italic">
            {availableArchives.map((code) => (
              <option key={`arch_${code}`} value={`arch_${code}`} className="bg-card text-primary font-medium py-1">
                {getArchiveName(code)} ({code.toUpperCase()})
              </option>
            ))}
          </optgroup>
        )}
        {availableKinds.length > 0 && (
          <optgroup label="Single Record Type" className="bg-card text-secondary font-bold not-italic">
            {availableKinds.map((code) => (
              <option key={`kind_${code}`} value={`kind_${code}`} className="bg-card text-primary font-medium py-1">
                {KIND_SHORT[code] || code} ({code})
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );

  const summaryValue = (
    <div className="text-right">
      <span className="font-serif text-lg font-bold text-primary mr-2">
        {Math.round(lastVal).toLocaleString()}
      </span>
      <span className={`text-xs font-mono font-semibold ${growth >= 0 ? 'text-green-600' : 'text-amber-500'}`}>
        {growth >= 0 ? `+${Math.round(growth).toLocaleString()}` : Math.round(growth).toLocaleString()}
      </span>
    </div>
  );

  return (
    <SmoothLineChart
      icon={Database}
      title="Corpus Growth"
      points={transformedPoints}
      series={series}
      stacked={isStacked}
      autoScaleY={!isStacked}
      height={height}
      rangeMinutes={rangeMinutes}
      onRangeChange={onRangeChange}
      controls={controls}
      summaryValue={summaryValue}
      emptyMessage="Collecting growth history samples…"
    />
  );
};

export default CorpusGrowthChart;
