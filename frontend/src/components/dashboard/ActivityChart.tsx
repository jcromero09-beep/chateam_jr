import type { ActivityPoint } from "@/lib/mock/dashboard";

const W = 600;
const H = 240;
const PAD = { l: 20, r: 16, t: 14, b: 28 };

const series = [
  { label: "Mensajes", color: "var(--primary)", area: true, get: (d: ActivityPoint) => d.mensajes },
  { label: "Usuarios activos", color: "var(--brand-coral)", area: false, get: (d: ActivityPoint) => d.usuarios },
];

export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const n = data.length;
  const maxRaw = Math.max(...data.flatMap((d) => [d.mensajes, d.usuarios]), 1);
  const maxY = Math.max(4, Math.ceil(maxRaw / 2) * 2);
  const baseline = PAD.t + plotH;

  const x = (i: number) => PAD.l + (n === 1 ? 0 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.t + plotH * (1 - v / maxY);

  const toLine = (get: (d: ActivityPoint) => number) =>
    data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(get(d)).toFixed(1)}`).join(" ");

  const grid = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      {/* Legend */}
      <div className="mb-3 flex items-center gap-4">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
            {s.label}
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Mensajes y usuarios activos en los últimos 7 días"
      >
        <defs>
          <linearGradient id="act-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Gridlines */}
        {grid.map((g) => {
          const yy = PAD.t + plotH * g;
          return (
            <line
              key={g}
              x1={PAD.l}
              x2={W - PAD.r}
              y1={yy}
              y2={yy}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray={g === 1 ? "0" : "3 4"}
            />
          );
        })}

        {/* Area for messages */}
        <path
          d={`${toLine(series[0].get)} L${x(n - 1).toFixed(1)},${baseline} L${x(0).toFixed(1)},${baseline} Z`}
          fill="url(#act-area)"
        />

        {/* Lines + dots */}
        {series.map((s) => (
          <g key={s.label}>
            <path d={toLine(s.get)} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            {data.map((d, i) => (
              <circle key={i} cx={x(i)} cy={y(s.get(d))} r={3} fill="var(--card)" stroke={s.color} strokeWidth={2} />
            ))}
          </g>
        ))}

        {/* X labels */}
        {data.map((d, i) => (
          <text
            key={d.day}
            x={x(i)}
            y={H - 8}
            textAnchor="middle"
            className="fill-muted-foreground"
            style={{ fontSize: 11 }}
          >
            {d.day}
          </text>
        ))}
      </svg>
    </div>
  );
}
