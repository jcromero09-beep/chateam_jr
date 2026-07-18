import { cn } from "@/lib/utils";
import type { Metric, Tone } from "@/lib/mock/dashboard";

const valueTone: Record<Tone, string> = {
  primary: "text-foreground",
  accent: "text-foreground",
  success: "text-success-text",
  warning: "text-warning-text",
  neutral: "text-foreground",
};

const barTone: Record<Tone, string> = {
  primary: "bg-primary",
  accent: "bg-brand-cyan",
  success: "bg-success",
  warning: "bg-warning",
  neutral: "bg-muted-foreground/40",
};

export function MetricCard({ metric }: { metric: Metric }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
      <p className="text-sm text-muted-foreground">{metric.label}</p>
      <p className={cn("mt-2 text-3xl font-semibold tracking-tight tabular-nums", valueTone[metric.tone])}>
        {metric.value}
      </p>

      {metric.progress !== undefined && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", barTone[metric.tone])}
            style={{ width: `${Math.max(metric.progress, 2)}%` }}
          />
        </div>
      )}

      <p className="mt-2 text-xs text-muted-foreground">{metric.context}</p>
    </div>
  );
}
