import React, { useMemo, useState } from 'react';
import { Database, Filter } from 'lucide-react';
import { getArchiveName } from '../config';

const MAX_POINTS = 360;

function downsample(values, target) {
  if (values.length <= target) return values;
  const size = values.length / target;
  const out = [];
  for (let i = 0; i < target; i++) {
    const slice = values.slice(
      Math.floor(i * size),
      Math.max(Math.floor((i + 1) * size), Math.floor(i * size) + 1)
    );
    if (!slice.length) continue;
    out.push({
      t: slice[Math.floor(slice.length / 2)].t,
      v: slice.reduce((a, b) => a + b.v, 0) / slice.length,
    });
  }
  return out;
}

function smoothPath(pts, top, bottom) {
  if (pts.length < 2) return '';
  const clamp = (y) => Math.max(top, Math.min(bottom, y));
  let d = `M${pts[0].x.toFixed(1)},${clamp(pts[0].y).toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = clamp(p1.y + (p2.y - p0.y) / 6);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = clamp(p2.y - (p3.y - p1.y) / 6);
    d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${clamp(p2.y).toFixed(1)}`;
  }
  return d;
}

const RANGES = [
  { minutes: 60, label: '1h' },
  { minutes: 360, label: '6h' },
  { minutes: 1440, label: '24h' },
];

/**
 * Timeline chart tracking historical record growth over time.
 * Supports filtering total corpus growth or narrowing down to specific archives.
 */
const CorpusGrowthChart = ({ points = [], height = 200, rangeMinutes = 360, onRangeChange }) => {
  const [selectedArchive, setSelectedArchive] = useState('all');
  const [hoverIndex, setHoverIndex] = useState(null);

  const W = 1000;
  const PAD_TOP = 12;
  const PAD_BOTTOM = 12;

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

  const chart = useMemo(() => {
    const usable = points
      .map((p) => {
        let v = null;
        if (selectedArchive === 'all') {
          v = typeof p.docs === 'number' ? p.docs : null;
        } else if (p.archives && typeof p.archives === 'object') {
          v = typeof p.archives[selectedArchive] === 'number' ? p.archives[selectedArchive] : 0;
        }
        return { t: p.t, v, archives: p.archives || {} };
      })
      .filter((p) => p.v !== null);

    if (usable.length < 2) return null;

    const t0 = usable[0].t;
    const t1 = usable[usable.length - 1].t;
    const span = Math.max(1, t1 - t0);

    const values = usable.map((p) => p.v);
    let minV = Math.min(...values);
    let maxV = Math.max(...values);

    // Give some breathing space if minV === maxV
    if (minV === maxV) {
      minV = Math.max(0, minV - 100);
      maxV = maxV + 100;
    } else {
      const pad = (maxV - minV) * 0.08;
      minV = Math.max(0, minV - pad);
      maxV = maxV + pad;
    }

    const x = (t) => ((t - t0) / span) * W;
    const y = (v) => height - PAD_BOTTOM - ((v - minV) / (maxV - minV || 1)) * (height - PAD_TOP - PAD_BOTTOM);

    const sampled = downsample(usable, MAX_POINTS);
    const pts = sampled.map((p) => ({ x: x(p.t), y: y(p.v) }));
    const line = smoothPath(pts, PAD_TOP, height - PAD_BOTTOM);
    const area = line ? `${line}L${W},${height - PAD_BOTTOM}L0,${height - PAD_BOTTOM}Z` : '';

    const firstVal = usable[0].v;
    const lastVal = usable[usable.length - 1].v;
    const growth = lastVal - firstVal;

    return { usable, sampled, line, area, x, minV, maxV, firstVal, lastVal, growth };
  }, [points, height, selectedArchive]);

  if (!chart) {
    return (
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3">
          <Database size={14} className="text-secondary" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">
            Corpus Record Growth
          </p>
        </div>
        <div className="flex items-center justify-center text-xs text-secondary" style={{ height }}>
          Collecting growth history samples…
        </div>
      </div>
    );
  }

  const { usable, line, area, x, lastVal, growth } = chart;
  const hovered = hoverIndex === null ? null : usable[hoverIndex];

  const pick = (clientX, element) => {
    const box = element.getBoundingClientRect();
    const ratio = (clientX - box.left) / box.width;
    setHoverIndex(
      Math.max(0, Math.min(usable.length - 1, Math.round(ratio * (usable.length - 1))))
    );
  };

  const stamp = (t) =>
    new Date(t * 1000).toLocaleString([], {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      {/* Header controls: Title, Archive Filter, Range Toggle */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Database size={14} className="text-secondary shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-secondary">
              Corpus Growth
            </span>
          </div>

          {/* Archive Filter Selector */}
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
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="font-serif text-lg font-bold text-primary mr-2">
              {Math.round(lastVal).toLocaleString()}
            </span>
            <span className={`text-xs font-mono font-semibold ${growth >= 0 ? 'text-green-600' : 'text-amber-500'}`}>
              {growth >= 0 ? `+${Math.round(growth).toLocaleString()}` : Math.round(growth).toLocaleString()}
            </span>
          </div>

          <div className="flex rounded-md border border-border overflow-hidden">
            {RANGES.map((r) => (
              <button
                key={r.minutes}
                type="button"
                onClick={() => onRangeChange?.(r.minutes)}
                aria-pressed={rangeMinutes === r.minutes}
                className={`px-2 py-0.5 text-[10px] transition-colors cursor-pointer ${
                  rangeMinutes === r.minutes
                    ? 'bg-accent text-on-accent'
                    : 'text-secondary hover:text-primary'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SVG Growth Chart */}
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${height}`}
          preserveAspectRatio="none"
          className="w-full block touch-none"
          style={{ height }}
          onMouseLeave={() => setHoverIndex(null)}
          onMouseMove={(e) => pick(e.clientX, e.currentTarget)}
          onTouchStart={(e) => pick(e.touches[0].clientX, e.currentTarget)}
          onTouchMove={(e) => pick(e.touches[0].clientX, e.currentTarget)}
          onTouchEnd={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id="growth-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {[0.25, 0.5, 0.75].map((f) => {
            const gy = height - PAD_BOTTOM - f * (height - PAD_TOP - PAD_BOTTOM);
            return (
              <line
                key={f}
                x1="0"
                y1={gy}
                x2={W}
                y2={gy}
                stroke="var(--color-border)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          <path d={area} fill="url(#growth-gradient)" />
          <path
            d={line}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {hovered && (
            <line
              x1={x(hovered.t)}
              y1={PAD_TOP}
              x2={x(hovered.t)}
              y2={height - PAD_BOTTOM}
              stroke="var(--color-secondary)"
              strokeWidth="1"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
              opacity="0.8"
            />
          )}
        </svg>

        {/* Crosshair Readout Tooltip Card */}
        {hovered && (
          <div
            className="absolute top-0 pointer-events-none z-10"
            style={{
              left: `${(x(hovered.t) / W) * 100}%`,
              transform:
                x(hovered.t) / W > 0.62
                  ? 'translateX(calc(-100% - 10px))'
                  : 'translateX(10px)',
            }}
          >
            <div className="bg-card border border-border-strong rounded-lg px-3 py-2 shadow-lg min-w-[10rem]">
              <p className="text-[10px] tabular-nums text-secondary mb-1.5 whitespace-nowrap">
                {stamp(hovered.t)}
              </p>
              <div className="flex items-center justify-between gap-3 text-xs font-semibold">
                <span className="text-secondary truncate max-w-[8rem]">
                  {selectedArchive === 'all' ? 'Total Corpus' : getArchiveName(selectedArchive)}
                </span>
                <span className="tabular-nums text-accent font-mono">
                  {Math.round(hovered.v).toLocaleString()} docs
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CorpusGrowthChart;
