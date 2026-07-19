// [Fase2·G.2] Login rediseñado (Tailwind design system). Reemplaza la versión MUI.
// BrandPanel (izq, ≥lg) + formulario cableado al auth real. Full responsive.
import { useSearchParams } from "react-router-dom";
import { BrandPanel } from "../components/login/BrandPanel";
import { LoginForm } from "../components/login/LoginForm";

// Motivo de desconexión (lo pasa api.ts al redirigir): mensaje claro en vez de "error".
const REASON_MESSAGES: Record<string, string> = {
  session_expired: "Tu sesión expiró por inactividad. Vuelve a iniciar sesión.",
  session_revoked: "Tu sesión se cerró porque iniciaste sesión en otro dispositivo.",
};

export default function Login() {
  const [params] = useSearchParams();
  const reason = params.get("reason");
  const message = reason ? REASON_MESSAGES[reason] : null;

  return (
    <main className="grid min-h-[100dvh] bg-background lg:grid-cols-[1.05fr_1fr] xl:grid-cols-[1.15fr_1fr]">
      <BrandPanel />
      <div className="relative flex min-h-[100dvh] items-center justify-center px-6 py-12 sm:px-10 lg:min-h-0">
        <div className="animate-fade-up">
          {message && (
            <div
              role="status"
              className="mx-auto mb-4 max-w-md rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground"
            >
              {message}
            </div>
          )}
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
