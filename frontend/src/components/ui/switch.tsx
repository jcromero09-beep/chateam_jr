import { cn } from "@/lib/utils";

/**
 * [Ola G · follow-up] Switch canónico del DS. Faltaba en ui/ ⇒ ~31 pantallas
 * duplicaron un Toggle local, y 7 de ellas a 20×36px — bajo el mínimo de
 * WCAG 2.5.8 (Target Size 24×24). Este es 24×44 (h-6 w-11), accesible.
 *
 * No usa Radix a propósito: es un <button role="switch"> puro, sin dependencia,
 * consistente con el resto de toggles ya migrados.
 */
export function Switch({
  checked,
  onCheckedChange,
  id,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  id?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-0 outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-input",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block size-5 rounded-full bg-card shadow-sm transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export default Switch;
