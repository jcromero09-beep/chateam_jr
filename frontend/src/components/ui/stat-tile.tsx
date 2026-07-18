import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "warning" | "destructive" | "neutral";

const valueTone: Record<Tone, string> = {
  primary: "text-foreground",
  success: "text-success-text",
  warning: "text-warning-text",
  destructive: "text-destructive-text",
  neutral: "text-foreground",
};

export function StatTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-1.5 text-3xl font-semibold tracking-tight tabular-nums", valueTone[tone])}>
        {value}
      </p>
    </div>
  );
}
