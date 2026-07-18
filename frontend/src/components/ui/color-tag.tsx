import { cn } from "@/lib/utils";

/**
 * Etiqueta/cola con color de entidad SIN perder legibilidad.
 *
 * El patron previo (fondo = color arbitrario + texto blanco) fallaba con colores
 * claros: "Notificaciones Nomina" en amarillo tenia texto blanco ilegible (falla
 * contraste WCAG). Aqui el color va como PUNTO, no como fondo, asi que el texto
 * siempre se lee sobre superficie neutra, sea cual sea el color de la etiqueta.
 */
export function ColorTag({
  color,
  name,
  title,
  className,
}: {
  color?: string | null;
  name: string;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title || name}
      className={cn(
        "inline-flex h-[18px] max-w-[92px] shrink-0 items-center gap-1 rounded border border-border bg-background px-1.5 text-[0.65rem] font-medium text-muted-foreground",
        className,
      )}
    >
      {color && (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}
