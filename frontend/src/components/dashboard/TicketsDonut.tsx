import type { TicketSlice } from "@/lib/mock/dashboard";

const R = 46;
const SW = 16;
const C = 2 * Math.PI * R;

export function TicketsDonut({ segments }: { segments: TicketSlice[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  let acc = 0;
  const arcs = segments.map((s) => {
    const len = total > 0 ? (s.value / total) * C : 0;
    const arc = { ...s, len, offset: -acc };
    acc += len;
    return arc;
  });

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative">
        <svg viewBox="0 0 120 120" className="size-44" role="img" aria-label={`${total} tickets en total`}>
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--muted)" strokeWidth={SW} />
          <g transform="rotate(-90 60 60)">
            {arcs.map((a) => (
              <circle
                key={a.label}
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke={a.color}
                strokeWidth={SW}
                strokeDasharray={`${a.len} ${C - a.len}`}
                strokeDashoffset={a.offset}
                strokeLinecap="butt"
              />
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tabular-nums text-foreground">{total}</span>
          <span className="text-xs text-muted-foreground">Total</span>
        </div>
      </div>

      <ul className="w-full space-y-2">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
            <span className="flex-1 text-muted-foreground">{s.label}</span>
            <span className="font-semibold tabular-nums text-foreground">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
