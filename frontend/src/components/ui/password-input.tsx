import * as React from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { Input, type InputProps } from "./input";

/** Password field with an accessible show/hide toggle. */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<InputProps, "type" | "rightSlot">
>(({ ...props }, ref) => {
  const [visible, setVisible] = React.useState(false);
  return (
    <Input
      ref={ref}
      type={visible ? "text" : "password"}
      rightSlot={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? (
            <EyeSlash className="size-[18px]" aria-hidden />
          ) : (
            <Eye className="size-[18px]" aria-hidden />
          )}
        </button>
      }
      {...props}
    />
  );
});
PasswordInput.displayName = "PasswordInput";
