import { Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  className?: string;
}

/** Accessible custom checkbox (role=checkbox, keyboard + space). */
export function Checkbox({
  checked,
  onCheckedChange,
  id,
  className,
}: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      id={id}
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-[6px] border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-card hover:border-primary/50",
        className,
      )}
    >
      {checked && <Check className="size-3.5" weight="bold" aria-hidden />}
    </button>
  );
}
