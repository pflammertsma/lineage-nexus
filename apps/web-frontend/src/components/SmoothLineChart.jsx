import React, { useMemo, useState } from 'react';

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
      item: slice[Math.floor(slice.length / 2)].item,
    });
  }
  return out;
}

/**
 * Fritsch-Carlson Monotone Cubic Hermite Interpolation.
 * Guarantees zero undershoot/overshoot dips on sharp steps.
 */
export function smoothPath(pts, top, bottom) {
  const n = pts.length;
  if (n < 2) return '';
  const clamp = (y) => Math.max(top, Math.min(bottom, y));

  if (n === 2) {
    return `M${pts[0].x.toFixed(1)},${clamp(pts[0].y).toFixed(1)}L${pts[1].x.toFixed(1)},${clamp(pts[1].y).toFixed(1)}`;
  }

  const dxs = new Float64Array(n - 1);
  const dys = new Float64Array(n - 1);
  const secants = new Float64Array(n - 1);

  for (let i = 0; i < n - 1; i++) {
    dxs[i] = pts[i + 1].x - pts[i].x;
    dys[i] = clamp(pts[i + 1].y) - clamp(pts[i].y);
    secants[i] = dxs[i] !== 0 ? dys[i] / dxs[i] : 0;
  }

  const ms = new Float64Array(n);
  ms[0] = secants[0];
  for (let i = 1; i < n - 1; i++) {
    if (secants[i - 1] * secants[i] <= 0) {
      ms[i] = 0;
    } else {
      ms[i] = (secants[i - 1] + secants[i]) / 2;
    }
  }
  ms[n - 1] = secants[n - 2];

  for (let i = 0; i < n - 1; i++) {
    if (secants[i] === 0) {
      ms[i] = 0;
      ms[i + 1] = 0;
    } else {
      const alpha = ms[i] / secants[i];
      const beta = ms[i + 1] / secants[i];
      const dist2 = alpha * alpha + beta * beta;
      if (dist2 > 9) {
        const tau = 3 / Math.sqrt(dist2);
        ms[i] = tau * alpha * secants[i];
        ms[i + 1] = tau * beta * secants[i];
      }
    }
  }

  let d = `M${pts[0].x.toFixed(1)},${clamp(pts[0].y).toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = dxs[i];
    const c1x = pts[i].x + dx / 3;
    const c1y = clamp(pts[i].y + ms[i] * (dx / 3));
    const c2x = pts[i + 1].x - dx / 3;
    const c2y = clamp(pts[i + 1].y - ms[i + 1] * (dx / 3));
    const px = pts[i + 1].x;
    const py = clamp(pts[i + 1].y);
    d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${px.toFixed(1)},${py.toFixed(1)}`;
  }
  return d;
}

const DEFAULT_RANGES = [
  { minutes: 60, label: '1h' },
  { minutes: 360, label: '6h' },
  { minutes: 1440, label: '24h' },
];

/**
 * Shared SVG Time-Series Chart Component.
 * Supports standard multi-line and stacked area chart modes with smooth monotone curves.
 */
const SmoothLineChart = ({
  icon: Icon,
  title,
  points = [],
  series = [],
  stacked = false,
  autoScaleY = false,
  maxY = 100,
  height = 200,
  rangeMinutes = 360,
  ranges = DEFAULT_RANGES,
  onRangeChange,
  controls = null,
  summaryValue = null,
  emptyMessage = 'Collecting samples…',
}) => {
  const [hoverIndex, setHoverIndex] = useState(null);

  const W = 1000;
  const PAD_TOP = 10;
  const PAD_BOTTOM = 10;

  const chart = useMemo(() => {
    if (!points || points.length < 2 || !series.length) return null;

    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const span = Math.max(1, t1 - t0);

    const x = (t) => ((t - t0) / span) * W;

    if (stacked) {
      // Calculate cumulative totals per point for stacked area layers
      const stackedPoints = points.map((p) => {
        let acc = 0;
        const cum = {};
        series.forEach((s) => {
          const val = typeof p[s.field] === 'number' ? p[s.field] : 0;
          acc += val;
          cum[s.field] = acc;
        });
        return { ...p, _cum: cum, _total: acc };
      });

      const maxVRaw = Math.max(...stackedPoints.map((p) => p._total), 1);
      const pad = maxVRaw * 0.05;
      const minV = 0;
      const maxV = maxVRaw + pad;

      const y = (v) =>
        height - PAD_BOTTOM - ((Math.max(minV, Math.min(maxV, v)) - minV) / (maxV - minV || 1)) * (height - PAD_TOP - PAD_BOTTOM);

      const processedSeries = series.map((s, sIdx) => {
        const rawTop = stackedPoints.map((p) => ({ t: p.t, v: p._cum[s.field] }));
        const rawBot =
          sIdx > 0
            ? stackedPoints.map((p) => ({ t: p.t, v: p._cum[series[sIdx - 1].field] }))
            : stackedPoints.map((p) => ({ t: p.t, v: 0 }));

        const sampledTop = downsample(rawTop, MAX_POINTS);
        const sampledBot = downsample(rawBot, MAX_POINTS);

        const ptsTop = sampledTop.map((p) => ({ x: x(p.t), y: y(p.v) }));
        const ptsBot = sampledBot.map((p) => ({ x: x(p.t), y: y(p.v) }));

        const topLine = smoothPath(ptsTop, PAD_TOP, height - PAD_BOTTOM);
        const botLine = sIdx > 0 ? smoothPath([...ptsBot].reverse(), PAD_TOP, height - PAD_BOTTOM) : null;

        const area = botLine
          ? `${topLine} ${botLine.replace(/^M/, 'L')} Z`
          : `${topLine} L${W},${height - PAD_BOTTOM} L0,${height - PAD_BOTTOM} Z`;

        return {
          ...s,
          line: topLine,
          area,
          last: points[points.length - 1]?.[s.field] ?? 0,
        };
      });

      return { points: stackedPoints, processedSeries, x, minV, maxV };
    }

    // Standard unstacked line chart mode
    let minV = 0;
    let maxV = maxY;

    if (autoScaleY) {
      let allValues = [];
      series.forEach((s) => {
        points.forEach((p) => {
          const val = typeof p[s.field] === 'number' ? p[s.field] : null;
          if (val !== null) allValues.push(val);
        });
      });
      if (allValues.length > 0) {
        minV = Math.min(...allValues);
        maxV = Math.max(...allValues);
        if (minV === maxV) {
          minV = Math.max(0, minV - 100);
          maxV = maxV + 100;
        } else {
          const pad = (maxV - minV) * 0.08;
          minV = Math.max(0, minV - pad);
          maxV = maxV + pad;
        }
      }
    }

    const y = (v) =>
      height - PAD_BOTTOM - ((Math.max(minV, Math.min(maxV, v)) - minV) / (maxV - minV || 1)) * (height - PAD_TOP - PAD_BOTTOM);

    const processedSeries = series.map((s) => {
      const raw = points
        .map((p) => ({ t: p.t, v: typeof p[s.field] === 'number' ? p[s.field] : null }))
        .filter((p) => p.v !== null);
      const sampled = downsample(raw, MAX_POINTS);
      const pts = sampled.map((p) => ({ x: x(p.t), y: y(p.v) }));
      const line = smoothPath(pts, PAD_TOP, height - PAD_BOTTOM);
      const area = line ? `${line}L${W},${height - PAD_BOTTOM}L0,${height - PAD_BOTTOM}Z` : '';
      return {
        ...s,
        line,
        area,
        last: raw[raw.length - 1]?.v ?? 0,
      };
    });

    return { points, processedSeries, x, minV, maxV };
  }, [points, series, stacked, autoScaleY, maxY, height]);

  if (!chart) {
    return (
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3">
          {Icon && <Icon size={14} className="text-secondary shrink-0" />}
          <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">{title}</p>
        </div>
        <div className="flex items-center justify-center text-xs text-secondary" style={{ height }}>
          {emptyMessage}
        </div>
      </div>
    );
  }

  const { processedSeries, x } = chart;
  const hovered = hoverIndex === null ? null : points[hoverIndex];

  const pick = (clientX, element) => {
    const box = element.getBoundingClientRect();
    const ratio = (clientX - box.left) / box.width;
    setHoverIndex(
      Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))))
    );
  };

  const stamp = (t) =>
    new Date(t * 1000).toLocaleString([], {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {Icon && <Icon size={14} className="text-secondary shrink-0" />}
            <span className="text-[10px] font-bold uppercase tracking-widest text-secondary">
              {title}
            </span>
          </div>
          {controls}
        </div>

        <div className="flex items-center gap-4">
          {summaryValue}
          <div className="flex rounded-md border border-border overflow-hidden">
            {ranges.map((r) => (
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
            {processedSeries.map((s) => (
              <linearGradient key={s.field} id={`g-${s.field}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.colour} stopOpacity={stacked ? '0.45' : '0.25'} />
                <stop offset="100%" stopColor={s.colour} stopOpacity={stacked ? '0.25' : '0.01'} />
              </linearGradient>
            ))}
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

          {/* Draw stacked areas from top to bottom or bottom to top */}
          {processedSeries.map((s) => (
            <path key={`a-${s.field}`} d={s.area} fill={`url(#g-${s.field})`} />
          ))}

          {!stacked &&
            processedSeries.map((s) => (
              <path
                key={`l-${s.field}`}
                d={s.line}
                fill="none"
                stroke={s.colour}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}

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
            <div className="bg-card border border-border-strong rounded-lg px-3 py-2 shadow-lg min-w-[10.5rem] max-h-48 overflow-y-auto">
              <p className="text-[10px] tabular-nums text-secondary mb-1.5 whitespace-nowrap">
                {stamp(hovered.t)}
              </p>
              <ul className="space-y-1">
                {processedSeries.map((s) => {
                  const val = hovered[s.field];
                  const formatted = s.formatter
                    ? s.formatter(val, hovered)
                    : Number.isFinite(val)
                    ? `${val.toFixed(1)}%`
                    : '—';
                  return (
                    <li key={s.field} className="flex items-center justify-between gap-3 text-[11px]">
                      <span className="flex items-center gap-1.5 truncate max-w-[8.5rem]">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ background: s.colour }}
                        />
                        <span className="text-secondary truncate">{s.label}</span>
                      </span>
                      <span className="tabular-nums font-mono shrink-0" style={{ color: s.colour }}>
                        {formatted}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SmoothLineChart;
