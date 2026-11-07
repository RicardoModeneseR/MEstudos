import { useEffect, useRef, useState } from 'react';

export interface LinePoint {
  label: string; // eixo x
  sub?: string; // linha secundária do eixo x
  value: number | null; // 0..1
  tooltip: string;
}

/** Gráfico de linha de série única, com crosshair e tooltip. Valores em fração (0..1). */
export function LineChart({ points, height = 220, ariaLabel }: { points: LinePoint[]; height?: number; ariaLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = { top: 22, right: 22, bottom: 44, left: 40 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null);
  const lo = vals.length ? Math.max(0, Math.min(0.5, Math.floor((Math.min(...vals) - 0.05) * 4) / 4)) : 0.5;
  const ticks = [lo, (lo + 1) / 2, 1];
  const x = (i: number) => pad.left + (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);
  const y = (v: number) => pad.top + (1 - (v - lo) / (1 - lo)) * h;

  const segments: string[] = [];
  let cur = '';
  points.forEach((p, i) => {
    if (p.value === null) {
      if (cur) segments.push(cur);
      cur = '';
      return;
    }
    cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
  });
  if (cur) segments.push(cur);
  const lastIdx = points.map((p) => p.value !== null).lastIndexOf(true);

  function onMove(clientX: number) {
    const rect = ref.current!.getBoundingClientRect();
    const px = clientX - rect.left;
    let best = 0;
    points.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    });
    setHover(best);
  }

  const hp = hover !== null ? points[hover] : null;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const showSubs = width / points.length > 70;

  return (
    <div
      ref={ref}
      className="chart"
      onMouseMove={(e) => onMove(e.clientX)}
      onMouseLeave={() => setHover(null)}
      onTouchStart={(e) => onMove(e.touches[0].clientX)}
      onTouchMove={(e) => onMove(e.touches[0].clientX)}
    >
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" className="chart-axis">{pct(t)}</text>
          </g>
        ))}
        {points.map((p, i) => (
          <g key={i}>
            <text x={x(i)} y={height - pad.bottom + 18} textAnchor={points.length > 1 && i === 0 ? 'start' : points.length > 1 && i === points.length - 1 ? 'end' : 'middle'} className="chart-axis">{p.label}</text>
            {showSubs && p.sub && (
              <text x={x(i)} y={height - pad.bottom + 34} textAnchor={points.length > 1 && i === 0 ? 'start' : points.length > 1 && i === points.length - 1 ? 'end' : 'middle'} className="chart-axis faint-axis">{p.sub}</text>
            )}
          </g>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + h} className="chart-cross" />}
        {segments.map((d, i) => <path key={i} d={d} className="chart-line" />)}
        {points.map((p, i) =>
          p.value === null ? null : (
            <circle key={i} cx={x(i)} cy={y(p.value)} r={hover === i ? 6 : 4.5} className="chart-dot" />
          ),
        )}
        {lastIdx >= 0 && hover === null && (
          <text x={x(lastIdx)} y={y(points[lastIdx].value!) - 12} textAnchor={points.length > 1 ? 'end' : 'middle'} className="chart-label">
            {pct(points[lastIdx].value!)}
          </text>
        )}
      </svg>
      {hp && hover !== null && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(x(hover), 80), width - 80), top: hp.value !== null ? y(hp.value) - 12 : pad.top }}>
          <strong>{hp.value !== null ? pct(hp.value) : 'Sem registros'}</strong>
          <span>{hp.label}</span>
          <span>{hp.tooltip}</span>
        </div>
      )}
    </div>
  );
}
