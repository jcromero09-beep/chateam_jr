import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium leading-none whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "border-transparent bg-muted text-muted-foreground",
        primary: "border-transparent bg-primary/12 text-primary",
        accent:
          "border-transparent bg-brand-cyan/15 text-[color:var(--brand-teal)] dark:text-brand-cyan",
        // [a11y] Texto con los tokens *-text (oscuros en claro): los tokens de
        // superficie (--success/--warning/--destructive) no llegan a 4.5:1 como texto.
        success: "border-transparent bg-success/14 text-success-text",
        warning: "border-transparent bg-warning/16 text-warning-text",
        destructive: "border-transparent bg-destructive/12 text-destructive-text",
        outline: "border-border bg-transparent text-muted-foreground",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
