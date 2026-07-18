// [Fase3·N2.3] Command palette (⌘K / Ctrl+K) — válvula de escape universal sobre TODAS las
// rutas navegables. Aditivo: no oculta nada, garantiza el invariante §6 (toda ruta alcanzable
// por búsqueda). Usa @radix-ui/react-dialog (ya instalado); sin dependencias nuevas.
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { MagnifyingGlass, ArrowElbowDownLeft } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface Command {
  label: string;
  path: string;
  section: string;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: Command[];
  onSelect: (path: string) => void;
}

// Normaliza para búsqueda tolerante a acentos.
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function CommandPalette({ open, onOpenChange, commands, onSelect }: CommandPaletteProps) {
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);

  const results = React.useMemo(() => {
    const q = norm(query.trim());
    if (!q) return commands;
    return commands.filter(
      (c) => norm(c.label).includes(q) || norm(c.section).includes(q) || norm(c.path).includes(q),
    );
  }, [query, commands]);

  // Reset al abrir; clamp del índice activo.
  React.useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);
  React.useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, results.length - 1)));
  }, [results.length]);

  // Mantener el ítem activo a la vista.
  React.useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (path: string) => {
    onSelect(path);
    onOpenChange(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (results.length ? (a + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (results.length ? (a - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[active];
      if (r) choose(r.path);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-[100] bg-black/50 backdrop-blur-[1px] duration-200",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
          )}
        />
        <DialogPrimitive.Content
          onKeyDown={onKeyDown}
          aria-label="Buscar en la aplicación"
          className={cn(
            "fixed left-1/2 top-[15vh] z-[100] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2",
            "overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl",
            // Animación shadcn: entra bajando con fade+zoom desde arriba.
            "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
            "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
            "data-[state=open]:slide-in-from-top-4 data-[state=closed]:slide-out-to-top-4",
          )}
        >
          <DialogPrimitive.Title className="sr-only">Buscar en la aplicación</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Escribe para filtrar pantallas; flechas para moverte, Enter para abrir.
          </DialogPrimitive.Description>

          <div className="flex items-center gap-2 border-b border-border px-4">
            <MagnifyingGlass className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar pantalla o acción…"
              aria-label="Buscar pantalla"
              className="h-12 w-full border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
              ESC
            </kbd>
          </div>

          <ScrollArea className="max-h-[50vh]">
          <div ref={listRef} className="p-1.5" role="listbox" aria-label="Resultados">
            {results.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Sin resultados para «{query}»
              </p>
            ) : (
              results.map((c, i) => (
                <button
                  key={c.path + i}
                  data-idx={i}
                  role="option"
                  aria-selected={i === active}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(c.path)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm outline-none",
                    i === active ? "bg-accent text-accent-foreground" : "text-foreground",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{c.label}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{c.section}</span>
                  </span>
                  {i === active && (
                    <ArrowElbowDownLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                </button>
              ))
            )}
          </div>
          </ScrollArea>

          <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
            <span>{results.length} de {commands.length}</span>
            <span className="hidden sm:inline">↑↓ moverse · ↵ abrir · esc cerrar</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
