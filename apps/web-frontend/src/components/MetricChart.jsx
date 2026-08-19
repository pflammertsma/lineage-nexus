import React, { useMemo, useState } from 'react';

/**
 * A filled line chart of one metric over time.
 *
 * Inline SVG rather than a charting library: this draws two paths and some grid
 * lines, and the smallest usable library would add more to the bundle than the
 * whole admin dashboard weighs.
 *
 * No point markers — at 15s resolution over six hours there are ~1440 samples,
 * and a dot per sample is a solid band rather than a line.
 */
const MetricChart = ({
  points,
  field,
  label,
  unit = '%',
  colour = 'var(--color-accent)',
  height = 120,
  max = 100,
}) => {
  const [hover, setHover] = useState(null);

  const { area, line, gridY, first, last, peak } = useMemo(() => {
    const values = points
      .map((p) => ({ t: p.t, v: typeof p[field] === 'number' ? p[field] : null }))
      .filter((p) => p.v !== null);

    if (values.length < 2) return {};

    const t0 = values[0].t;
    const t1 = values[values.length - 1].t;
    const span = Math.max(1, t1 - t0);
    const ceiling = max || Math.max(...values.map((v) => v.v)) || 1;

    // viewBox coordinates; the SVG scales to its container.
    const W = 1000;
    const H = height;
    const x = (t) => ((t - t0) / span) * W;
    const y = (v) => H - (Math.min(v, ceiling) / ceiling) * (H - 4) - 2;

    const d = values.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');

    return {
      line: d,
      // Closed along the baseline so the area beneath can be filled.
      area: `${d}L${W},${H}L0,${H}Z`,
      gridY: [0.25, 0.5, 0.75].map((f) => H - f * (H - 4) - 2),
      first: values[0],
      last: values[values.length - 1],
      peak: values.reduce((a, b) => (b.v > a.v ? b : a)),
    };
  }, [points, field, height, max]);

  const time = (t) =>
    new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (!line) {
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-3">{label}</p>
        <div className="flex items-center justify-center text-xs text-secondary" style={{ height }}>
          Collecting samples…
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-3 gap-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">{label}</p>
        <p className="text-sm font-mono" style={{ color: colour }}>
          {hover ? `${hover.v}${unit}` : `${last.v}${unit}`}
          <span className="text-secondary ml-2 text-[11px]">
            {hover ? time(hover.t) : `peak ${peak.v}${unit}`}
          </span>
        </p>
      </div>

      <svg
        viewBox={`0 0 1000 ${height}`}
        preserveAspectRatio="none"
        className="w-full block"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - box.left) / box.width;
          const valid = points.filter((p) => typeof p[field] === 'number');
          const i = Math.round(ratio * (valid.length - 1));
          const p = valid[Math.max(0, Math.min(valid.length - 1, i))];
          if (p) setHover({ t: p.t, v: p[field] });
        }}
      >
        <defs>
          <linearGradient id={`fill-${field}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colour} stopOpacity="0.35" />
            <stop offset="100%" stopColor={colour} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {gridY.map((gy) => (
          <line key={gy} x1="0" y1={gy} x2="1000" y2={gy}
                stroke="var(--color-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}

        <path d={area} fill={`url(#fill-${field})`} />
        {/* non-scaling-stroke keeps the line 1.5px however the SVG is stretched. */}
        <path d={line} fill="none" stroke={colour} strokeWidth="1.5"
              vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>

      <div className="flex justify-between mt-2 text-[10px] text-secondary font-mono">
        <span>{time(first.t)}</span>
        <span>{time(last.t)}</span>
      </div>
    </div>
  );
};

export default MetricChart;
