import { cn } from "@/lib/utils";
import type { Kpi, Tone } from "@/lib/mock/dashboard";

const toneClasses: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-brand-cyan/15 text-[color:var(--brand-teal)] dark:text-brand-cyan",
  success: "bg-success/12 text-success-text",
  warning: "bg-warning/14 text-warning-text",
  neutral: "bg-muted text-muted-foreground",
};

export function StatCard({ kpi }: { kpi: Kpi }) {
  const Icon = kpi.icon;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm text-muted-foreground">{kpi.label}</span>
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            toneClasses[kpi.tone],
          )}
        >
          <Icon className="size-[18px]" weight="fill" aria-hidden />
        </span>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground tabular-nums">
        {kpi.value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{kpi.sublabel}</p>
    </div>
  );
}
