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
      emptyMessage="Collecting system metrics samples…"
    />
  );
};

export default MetricChart;
