import React, { useMemo, useState } from 'react';
import { Database, Filter } from 'lucide-react';
import { getArchiveName } from '../config';
import SmoothLineChart from './SmoothLineChart';

/**
 * Timeline chart tracking historical record growth over time.
 * Reuses the shared SmoothLineChart component with an Archive Filter dropdown.
 */
const CorpusGrowthChart = ({ points = [], height = 200, rangeMinutes = 360, onRangeChange }) => {
  const [selectedArchive, setSelectedArchive] = useState('all');

  // Extract all distinct archive codes seen in metrics
  const availableArchives = useMemo(() => {
    const set = new Set();
    points.forEach((p) => {
      if (p.archives && typeof p.archives === 'object') {
        Object.keys(p.archives).forEach((k) => set.add(k));
      }
    });
    return Array.from(set).sort();
  }, [points]);

  // Transform raw points to map selected archive value onto 'value' field
  const transformedPoints = useMemo(() => {
    return points.map((p) => {
      let value = null;
      if (selectedArchive === 'all') {
        value = typeof p.docs === 'number' ? p.docs : null;
      } else if (p.archives && typeof p.archives === 'object') {
        value = typeof p.archives[selectedArchive] === 'number' ? p.archives[selectedArchive] : 0;
      }
      return { ...p, value };
    });
  }, [points, selectedArchive]);

  const series = useMemo(
    () => [
      {
        field: 'value',
        label: selectedArchive === 'all' ? 'Total Corpus' : getArchiveName(selectedArchive),
        colour: 'var(--color-accent)',
        formatter: (v) => (Number.isFinite(v) ? `${Math.round(v).toLocaleString()} docs` : '—'),
      },
    ],
    [selectedArchive]
  );

  // Compute summary growth stats
  const { lastVal, growth } = useMemo(() => {
    const usable = transformedPoints.filter((p) => typeof p.value === 'number');
    if (usable.length < 2) return { lastVal: 0, growth: 0 };
    const first = usable[0].value;
    const last = usable[usable.length - 1].value;
    return { lastVal: last, growth: last - first };
  }, [transformedPoints]);

  const controls = (
    <div className="flex items-center gap-1.5 bg-surface border border-border rounded-md px-2 py-1 text-xs">
      <Filter size={12} className="text-secondary shrink-0" />
      <select
        value={selectedArchive}
        onChange={(e) => setSelectedArchive(e.target.value)}
        className="bg-transparent text-xs text-primary font-medium focus:outline-none cursor-pointer"
      >
        <option value="all">All Archives (Total)</option>
        {availableArchives.map((code) => (
          <option key={code} value={code}>
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
      autoScaleY={true}
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
