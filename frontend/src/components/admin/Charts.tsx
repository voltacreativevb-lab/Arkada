export function StatTile({ label, value, sublabel, color }: { label: string; value: string | number; sublabel?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-line p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="font-display text-2xl mt-1" style={{ color: color ?? "#16191D" }}>
        {value}
      </div>
      {sublabel && <div className="text-xs text-muted mt-1">{sublabel}</div>}
    </div>
  );
}

/** Fixed-order categorical palette (dataviz skill reference palette) — never cycled, folds past slot 8 into "Ostalo". */
export const CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

type BarDatum = { label: string; value: number };

export function HBarChart({ data }: { data: BarDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={d.label} className="flex items-center gap-3">
          <div className="w-32 text-xs text-muted truncate shrink-0">{d.label}</div>
          <div className="flex-1 h-2.5 rounded-full bg-[#EEF0F2] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(d.value / max) * 100}%`, background: CATEGORICAL[i % CATEGORICAL.length] }}
              title={`${d.label}: ${d.value.toLocaleString("sr-RS")} din`}
            />
          </div>
          <div className="w-20 text-xs font-medium text-ink text-right tabular-nums">{d.value.toLocaleString("sr-RS")} din</div>
        </div>
      ))}
      {data.length === 0 && <p className="text-sm text-muted m-0">Nema podataka za ovaj period.</p>}
    </div>
  );
}

export function TrendChart({ data }: { data: { label: string; value: number }[] }) {
  const width = 640;
  const height = 180;
  const padding = { top: 16, right: 12, bottom: 24, left: 12 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const points = data.map((d, i) => ({ x: padding.left + i * stepX, y: padding.top + innerH - (d.value / max) * innerH, ...d }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath =
    points.length > 0 ? `${linePath} L ${points[points.length - 1].x} ${padding.top + innerH} L ${points[0].x} ${padding.top + innerH} Z` : "";

  // Thin out x-axis labels so they don't collide on longer ranges.
  const labelEvery = Math.max(1, Math.ceil(points.length / 10));

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id="mv-trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a78d6" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#2a78d6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={padding.left} y1={padding.top + innerH} x2={width - padding.right} y2={padding.top + innerH} stroke="#e1e0d9" strokeWidth="1" />
      {points.length > 0 && <path d={areaPath} fill="url(#mv-trend-fill)" stroke="none" />}
      {points.length > 0 && <path d={linePath} fill="none" stroke="#2a78d6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
      {points.map((p, i) => (
        <g key={p.label}>
          <circle cx={p.x} cy={p.y} r="3.5" fill="#fff" stroke="#2a78d6" strokeWidth="2">
            <title>{`${p.label}: ${p.value.toLocaleString("sr-RS")} din`}</title>
          </circle>
          {i % labelEvery === 0 && (
            <text x={p.x} y={height - 4} fontSize="10" textAnchor="middle" fill="#898781">
              {p.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
