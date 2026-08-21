import React from 'react';
import { Activity } from 'lucide-react';
import SmoothLineChart from './SmoothLineChart';

const SERIES = [
  { field: 'cpu', label: 'CPU', colour: 'var(--color-accent)' },
  { field: 'iowait', label: 'I/O wait', colour: '#EF4444' },
  { field: 'mem', label: 'Memory', colour: '#10B981' },
  { field: 'disk', label: 'Disk', colour: '#C8A464' },
];

/**
 * CPU, memory, disk, and I/O wait on one set of axes over time.
 * Reuses the shared SmoothLineChart component.
 */
// Diagnostic ranges. 1h at full resolution is what made a stalled engine
// visible — 98 MB/s of reads at 0% idle — and it is the window that would be
// lost by adopting the growth chart's scale.
const SYSTEM_RANGES = [
  { minutes: 60, label: '1h' },
  { minutes: 360, label: '6h' },
  { minutes: 1440, label: '24h' },
];

const MetricChart = ({ points, height = 200, rangeMinutes = 360, onRangeChange }) => {
  return (
    <SmoothLineChart
      icon={Activity}
      title="System"
      points={points}
      series={SERIES}
      autoScaleY={false}
      maxY={100}
      height={height}
      rangeMinutes={rangeMinutes}
      onRangeChange={onRangeChange}
      ranges={SYSTEM_RANGES}
      emptyMessage="Collecting system metrics samples…"
    />
  );
};

export default MetricChart;
