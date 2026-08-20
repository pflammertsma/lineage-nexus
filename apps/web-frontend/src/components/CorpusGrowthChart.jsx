import React, { useMemo, useState } from 'react';
import { Database, Filter } from 'lucide-react';
import { getArchiveName, ADMIN_CHART_ARCHIVE_FILTER_STORAGE } from '../config';
import SmoothLineChart from './SmoothLineChart';

/**
 * Generates an infinitely distinct, visually harmonious HSL color for any archive index
 * using the Golden Ratio (Golden Angle = 137.508°).
 */
export function getArchiveColor(index) {
  const hue = (index * 137.508) % 360;
  const saturation = 70 + (index % 3) * 8;
  const lightness = 55 + (index % 4) * 5;
  return `hsl(${hue.toFixed(1)}, ${saturation}%, ${lightness}%)`;
}

/**
 * Timeline chart tracking historical record growth over time.
 * Supports Total Corpus, Stacked Area Breakdown, and Single Archive drilldown modes.
 */
const CorpusGrowthChart = ({ points = [], height = 200, rangeMinutes = 360, onRangeChange }) => {
  const [selectedArchive, setSelectedArchive] = useState(() => {
    try {
      return localStorage.getItem(ADMIN_CHART_ARCHIVE_FILTER_STORAGE) || 'all';
    } catch {
      return 'all';
    }
  });

  const handleArchiveChange = (val) => {
    setSelectedArchive(val);
    try {
      localStorage.setItem(ADMIN_CHART_ARCHIVE_FILTER_STORAGE, val);
    } catch {
      // Ignore storage error
    }
  };

  // Extract all distinct archive codes seen in metrics
  const availableArchives = useMemo(() => {
    const set = new Set();
    points.forEach((p) => {
      if (p.archives && typeof p.archives === 'object') {
        Object.keys(p.archives).forEach((k) => set.add(k));
      }
    });

    // Sort by latest document count descending so largest archive sits at bottom of stack
    const latestArchives = points[points.length - 1]?.archives || {};
    return Array.from(set).sort((a, b) => (latestArchives[b] || 0) - (latestArchives[a] || 0));
  }, [points]);

  const isStacked = selectedArchive === 'stacked';

  // Transform raw points to include archive values directly on point keys
  const transformedPoints = useMemo(() => {
    return points.map((p) => {
      const archivesObj = p.archives || {};
      let value = null;
      if (selectedArchive === 'all') {
        value = typeof p.docs === 'number' ? p.docs : null;
      } else if (selectedArchive !== 'stacked') {
        value = typeof archivesObj[selectedArchive] === 'number' ? archivesObj[selectedArchive] : 0;
      }

      const row = { ...p, value };
      availableArchives.forEach((code) => {
        row[code] = typeof archivesObj[code] === 'number' ? archivesObj[code] : 0;
      });
      return row;
    });
  }, [points, selectedArchive, availableArchives]);

  const series = useMemo(() => {
    if (isStacked) {
      return availableArchives.map((code, idx) => ({
        field: code,
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

    return [
      {
        field: 'value',
        label: selectedArchive === 'all' ? 'Total Corpus' : getArchiveName(selectedArchive),
        colour: 'var(--color-accent)',
        formatter: (v) => (Number.isFinite(v) ? `${Math.round(v).toLocaleString()} docs` : '—'),
      },
    ];
  }, [selectedArchive, isStacked, availableArchives]);

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
        value={selectedArchive}
        onChange={(e) => handleArchiveChange(e.target.value)}
        className="bg-transparent text-xs text-primary font-medium focus:outline-none cursor-pointer"
      >
        <option value="all" className="bg-card text-primary font-medium py-1">
          All Archives (Total)
        </option>
        <option value="stacked" className="bg-card text-primary font-medium py-1">
          Stacked Archives (Breakdown)
        </option>
        {availableArchives.map((code) => (
          <option key={code} value={code} className="bg-card text-primary font-medium py-1">
            {getArchiveName(code)} ({code.toUpperCase()})
          </option>
        ))}
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
