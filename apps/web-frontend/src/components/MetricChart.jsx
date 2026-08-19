import React, { useMemo, useState } from 'react';

const SERIES = [
  { field: 'cpu', label: 'CPU', colour: 'var(--color-accent)' },
  { field: 'mem', label: 'Memory', colour: '#10B981' },
  { field: 'disk', label: 'Disk', colour: '#C8A464' },
];

// Above this, neighbouring samples are averaged into buckets. 1440 raw points
// across three smoothed series is ~200 kB of path data in the DOM for detail no
// screen can resolve.
const MAX_POINTS = 360;

function downsample(values, target) {
  if (values.length <= target) return values;
  const size = values.length / target;
  const out = [];
  for (let i = 0; i < target; i++) {
    const slice = values.slice(Math.floor(i * size), Math.max(Math.floor((i + 1) * size), Math.floor(i * size) + 1));
    if (!slice.length) continue;
    out.push({
      t: slice[Math.floor(slice.length / 2)].t,
      v: slice.reduce((a, b) => a + b.v, 0) / slice.length,
    });
  }
  return out;
}

/**
 * Catmull-Rom through the points, emitted as cubic beziers.
 *
 * y is clamped to the plot area because the spline overshoots on a sharp step —
 * a CPU jump from 0 to 100 would otherwise bulge past the top of the chart and
 * read as >100%.
 */
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

/**
 * CPU, memory and disk on one set of axes over six hours.
 *
 * One chart rather than three: they share a 0–100% scale, and the useful
 * question is how they move together — a CPU spike that also moves memory reads
 * very differently from one that does not.
 */
const MetricChart = ({ points, height = 200 }) => {
  const [hoverIndex, setHoverIndex] = useState(null);

  const W = 1000;
  const PAD_TOP = 6;
  const PAD_BOTTOM = 6;

  const chart = useMemo(() => {
    const usable = points.filter((p) => typeof p.cpu === 'number');
    if (usable.length < 2) return null;

    const t0 = usable[0].t;
    const t1 = usable[usable.length - 1].t;
    const span = Math.max(1, t1 - t0);

    const x = (t) => ((t - t0) / span) * W;
    const y = (v) => height - PAD_BOTTOM - (Math.min(v, 100) / 100) * (height - PAD_TOP - PAD_BOTTOM);

    const series = SERIES.map((s) => {
      const raw = usable
        .map((p) => ({ t: p.t, v: typeof p[s.field] === 'number' ? p[s.field] : null }))
        .filter((p) => p.v !== null);
      const sampled = downsample(raw, MAX_POINTS);
      const pts = sampled.map((p) => ({ x: x(p.t), y: y(p.v) }));
      const line = smoothPath(pts, PAD_TOP, height - PAD_BOTTOM);
      return {
        ...s,
        line,
        area: line ? `${line}L${W},${height - PAD_BOTTOM}L0,${height - PAD_BOTTOM}Z` : '',
        last: raw[raw.length - 1]?.v ?? 0,
        peak: raw.reduce((a, b) => Math.max(a, b.v), 0),
      };
    });

    return { usable, series, x, t0, t1 };
  }, [points, height]);

  if (!chart) {
    return (
      <div className="bg-card border border-border rounded-lg p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-3">
          System · 6 hours
        </p>
        <div className="flex items-center justify-center text-xs text-secondary" style={{ height }}>
          Collecting samples…
        </div>
      </div>
    );
  }

  const { usable, series, x } = chart;
  const hovered = hoverIndex === null ? null : usable[hoverIndex];
  const stamp = (t) =>
    new Date(t * 1000).toLocaleString([], {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">
          System · 6 hours
        </p>
        <div className="flex items-center gap-4 flex-wrap">
          {series.map((s) => (
            <span key={s.field} className="flex items-center gap-1.5 text-[11px]">
              <span className="w-2.5 h-0.5 rounded-full" style={{ background: s.colour }} />
              <span className="text-secondary">{s.label}</span>
              <span className="font-mono" style={{ color: s.colour }}>
                {(hovered ? hovered[s.field] : s.last)?.toFixed(1)}%
              </span>
            </span>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        className="w-full block"
        style={{ height }}
        onMouseLeave={() => setHoverIndex(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - box.left) / box.width;
          setHoverIndex(Math.max(0, Math.min(usable.length - 1, Math.round(ratio * (usable.length - 1)))));
        }}
      >
        <defs>
          {series.map((s) => (
            <linearGradient key={s.field} id={`g-${s.field}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.colour} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.colour} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>

        {[0.25, 0.5, 0.75].map((f) => {
          const gy = height - PAD_BOTTOM - f * (height - PAD_TOP - PAD_BOTTOM);
          return (
            <line key={f} x1="0" y1={gy} x2={W} y2={gy}
                  stroke="var(--color-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          );
        })}

        {series.map((s) => <path key={`a-${s.field}`} d={s.area} fill={`url(#g-${s.field})`} />)}
        {series.map((s) => (
          <path key={`l-${s.field}`} d={s.line} fill="none" stroke={s.colour} strokeWidth="1.5"
                vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {hovered && (
          <line
            x1={x(hovered.t)} y1={PAD_TOP} x2={x(hovered.t)} y2={height - PAD_BOTTOM}
            stroke="var(--color-secondary)" strokeWidth="1" strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke" opacity="0.8"
          />
        )}
      </svg>

      <div className="flex justify-between items-center mt-2 text-[10px] font-mono text-secondary">
        <span>{stamp(usable[0].t)}</span>
        {/* Fixed height so the row does not jump as the readout appears. */}
        <span className="text-primary h-4">{hovered ? stamp(hovered.t) : ''}</span>
        <span>{stamp(usable[usable.length - 1].t)}</span>
      </div>
    </div>
  );
};

export default MetricChart;
