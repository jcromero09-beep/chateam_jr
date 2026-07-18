import { cn } from "@/lib/utils";

const sizes = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-11 text-sm",
};

/** Deterministic tint from a string, drawn from a brand-friendly palette. */
const palette = [
  "bg-brand-teal text-white",
  "bg-brand-cyan/25 text-[color:var(--brand-teal)] dark:text-brand-cyan",
  "bg-primary/12 text-primary",
  "bg-success/15 text-success-text",
  "bg-warning/18 text-warning-text",
];

function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initials(name: string) {
  const parts = name.trim().replace(/^\+/, "").split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        sizes[size],
        palette[hash(name) % palette.length],
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
