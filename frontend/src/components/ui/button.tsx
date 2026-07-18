import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { SpinnerGap } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // [Fase2·G] `tailwind.css` se importa SIN preflight (para coexistir con MUI), así que
  // el <button> conserva border/appearance/font del navegador → los reseteamos aquí.
  // `border-0` va en la base: la variante `outline` lo sobreescribe con `border` (tailwind-merge).
  "appearance-none border-0 [font-family:inherit] cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium select-none outline-none transition-[background-color,border-color,color,transform,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-55 disabled:cursor-not-allowed [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover",
        outline:
          "border border-input bg-card text-foreground hover:bg-accent hover:text-accent-foreground hover:border-accent",
        ghost:
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        whatsapp:
          "border border-wa/40 bg-wa/10 text-foreground hover:bg-wa/16",
      },
      size: {
        sm: "h-9 px-3.5 text-sm",
        md: "h-11 px-5 text-sm",
        lg: "h-12 px-6 text-[15px]",
        icon: "size-10 p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && (
          <SpinnerGap className="size-4 animate-spin" weight="bold" aria-hidden />
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
