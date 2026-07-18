// [Fase2·G.2] Login rediseñado (Tailwind design system). Reemplaza la versión MUI.
// BrandPanel (izq, ≥lg) + formulario cableado al auth real. Full responsive.
import { BrandPanel } from "../components/login/BrandPanel";
import { LoginForm } from "../components/login/LoginForm";

export default function Login() {
  return (
    <main className="grid min-h-[100dvh] bg-background lg:grid-cols-[1.05fr_1fr] xl:grid-cols-[1.15fr_1fr]">
      <BrandPanel />
      <div className="relative flex min-h-[100dvh] items-center justify-center px-6 py-12 sm:px-10 lg:min-h-0">
        <div className="animate-fade-up">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
