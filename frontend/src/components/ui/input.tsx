import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Icon rendered inside the field, left side. */
  leftIcon?: React.ReactNode;
  /** Interactive element rendered inside the field, right side (e.g. show/hide). */
  rightSlot?: React.ReactNode;
  /** Visual error state — also wire aria-invalid from the form. */
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, leftIcon, rightSlot, invalid, ...props }, ref) => {
    return (
      <div className="relative">
        {leftIcon && (
          <span
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground [&_svg]:size-[18px]"
            aria-hidden
          >
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          aria-invalid={invalid || undefined}
          className={cn(
            "h-11 w-full rounded-md border border-input bg-card text-sm text-foreground shadow-sm outline-none transition-colors",
            "px-3.5 placeholder:text-muted-foreground",
            "hover:border-muted-foreground/40",
            "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
            "disabled:cursor-not-allowed disabled:opacity-55",
            leftIcon && "pl-11",
            rightSlot && "pr-11",
            invalid &&
              "border-destructive hover:border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30",
            className,
          )}
          {...props}
        />
        {rightSlot && (
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2">
            {rightSlot}
          </span>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";
