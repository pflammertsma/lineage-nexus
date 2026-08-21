import React, { useMemo, useState } from 'react';

/**
 * Generic Interactive SVG Donut / Pie Chart Component.
 * Supports 100% single-slice rendering, hover tooltips, center summary labels,
 * responsive layout, and optional inline legends.
 */
const DonutChart = ({
  data = [],
  totalValue: explicitTotal = 0,
  title = '',
  valueUnit = 'records',
  className = '',
  showLegend = false,
  emptyMessage = 'No chart data available',
}) => {
  const [hoverIndex, setHoverIndex] = useState(null);

  const totalValue = useMemo(() => {
    if (explicitTotal > 0) return explicitTotal;
    return (data || []).reduce((acc, d) => acc + (d.value || 0), 0);
  }, [data, explicitTotal]);

  const slices = useMemo(() => {
    if (!data || !data.length || totalValue <= 0) return [];
    let cumulative = 0;
    return data.map((d, i) => {
      const val = d.value || 0;
      const startAngle = (cumulative / totalValue) * 2 * Math.PI;
      cumulative += val;
      const endAngle = (cumulative / totalValue) * 2 * Math.PI;
      const percentage = ((val / totalValue) * 100).toFixed(1);
      return {
        ...d,
        startAngle,
        endAngle,
        percentage,
        index: i,
        color: d.color || `hsl(${(i * 137.5) % 360}, 70%, 55%)`,
      };
    });
  }, [data, totalValue]);

  if (!slices.length) {
    return (
      <div className={`flex items-center justify-center p-6 bg-muted/20 border border-border/50 rounded-lg text-xs text-secondary italic ${className}`}>
        {emptyMessage}
      </div>
    );
  }

  const R_OUT = 90;
  const R_IN = 56;
  const CX = 100;
  const CY = 100;

  const getSectorPath = (startAngle, endAngle) => {
    // Full circle special case: two 180-degree arcs for accurate rendering without SVG artifacts
    if (endAngle - startAngle >= 2 * Math.PI - 0.0001) {
      return (
        `M ${CX},${CY - R_OUT} ` +
        `A ${R_OUT},${R_OUT} 0 1,1 ${CX},${CY + R_OUT} ` +
        `A ${R_OUT},${R_OUT} 0 1,1 ${CX},${CY - R_OUT} ` +
        `M ${CX},${CY - R_IN} ` +
        `A ${R_IN},${R_IN} 0 1,0 ${CX},${CY + R_IN} ` +
        `A ${R_IN},${R_IN} 0 1,0 ${CX},${CY - R_IN} Z`
      );
    }

    const x1_out = CX + R_OUT * Math.sin(startAngle);
    const y1_out = CY - R_OUT * Math.cos(startAngle);
    const x2_out = CX + R_OUT * Math.sin(endAngle);
    const y2_out = CY - R_OUT * Math.cos(endAngle);

    const x1_in = CX + R_IN * Math.sin(endAngle);
    const y1_in = CY - R_IN * Math.cos(endAngle);
    const x2_in = CX + R_IN * Math.sin(startAngle);
    const y2_in = CY - R_IN * Math.cos(startAngle);

    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

    return `M ${x1_out.toFixed(2)},${y1_out.toFixed(2)} A ${R_OUT} ${R_OUT} 0 ${largeArc} 1 ${x2_out.toFixed(2)},${y2_out.toFixed(2)} L ${x1_in.toFixed(2)},${y1_in.toFixed(2)} A ${R_IN} ${R_IN} 0 ${largeArc} 0 ${x2_in.toFixed(2)},${y2_in.toFixed(2)} Z`;
  };

  const activeSlice = hoverIndex !== null ? slices[hoverIndex] : null;

  return (
    <div className={`flex flex-col items-center justify-center p-3 bg-muted/20 border border-border/50 rounded-lg ${className}`}>
      <div className="relative w-48 h-48 sm:w-56 sm:h-56">
        <svg
          viewBox="0 0 200 200"
          className="w-full h-full transform -rotate-90 touch-none"
          onMouseLeave={() => setHoverIndex(null)}
        >
          {slices.map((s) => {
            const isHovered = hoverIndex === s.index;
            return (
              <path
                key={s.key || s.label || s.index}
                d={getSectorPath(s.startAngle, s.endAngle)}
                fill={s.color}
                stroke="var(--color-card)"
                strokeWidth="2"
                className="transition-all duration-200 cursor-pointer"
                style={{
                  opacity: hoverIndex === null || isHovered ? 1 : 0.45,
                  transform: isHovered ? 'scale(1.03)' : 'scale(1)',
                  transformOrigin: '100px 100px',
                }}
                onMouseEnter={() => setHoverIndex(s.index)}
                onTouchStart={() => setHoverIndex(s.index)}
              />
            );
          })}
        </svg>

        {/* Donut Center Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
          {activeSlice ? (
            <>
              <span className="text-[10px] font-bold uppercase tracking-wider text-secondary truncate max-w-full">
                {activeSlice.label}
              </span>
              <span className="font-serif text-sm font-bold text-primary" style={{ color: activeSlice.color }}>
                {activeSlice.value.toLocaleString()}
              </span>
              <span className="text-[10px] font-medium text-secondary">
                {activeSlice.percentage}%
              </span>
            </>
          ) : (
            <>
              <span className="text-[10px] font-bold uppercase tracking-wider text-secondary/70">
                {title || 'TOTAL'}
              </span>
              <span className="font-serif text-base font-bold text-primary">
                {totalValue.toLocaleString()}
              </span>
              {valueUnit && (
                <span className="text-[10px] text-secondary/60">
                  {valueUnit}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {showLegend && (
        <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[11px]">
          {slices.map((s) => (
            <div
              key={s.key || s.label}
              onMouseEnter={() => setHoverIndex(s.index)}
              onMouseLeave={() => setHoverIndex(null)}
              className={`flex items-center gap-1.5 cursor-pointer transition-opacity ${
                hoverIndex !== null && hoverIndex !== s.index ? 'opacity-40' : 'opacity-100'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-secondary hover:text-primary transition-colors">{s.label}</span>
              <span className="text-secondary/70 font-mono text-[10px]">{s.percentage}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DonutChart;
