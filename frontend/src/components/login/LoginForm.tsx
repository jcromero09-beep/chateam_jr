// [Fase2·G.2] Formulario de login (design system) CABLEADO al auth real de chateam.
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Envelope, Lock, WhatsappLogo } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "../../hooks/useAuth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_CONTACT || "5491234567890";

export function LoginForm() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [remember, setRemember] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<{ email?: string; password?: string }>({});

  function validate() {
    const next: { email?: string; password?: string } = {};
    if (!email) next.email = "Ingresa tu correo electrónico.";
    else if (!EMAIL_RE.test(email)) next.email = "El correo no tiene un formato válido.";
    if (!password) next.password = "Ingresa tu contraseña.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!validate()) return;
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result?.success) {
        toast.success("Inicio de sesión exitoso");
        navigate("/");
      }
    } catch {
      toast.error("Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  const contactWhatsApp = () => {
    const msg = encodeURIComponent("Hola, necesito ayuda con mi acceso a Chateam");
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, "_blank");
  };

  return (
    <div className="w-full max-w-[400px]">
      <img src="/logo-chateam.svg" alt="Chateam" className="mb-10 h-9 w-auto lg:hidden" />

      <header className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Inicia sesión</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">Accede a tu panel de Chateam.</p>
      </header>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">Correo electrónico</Label>
          <Input
            id="email" type="email" inputMode="email" autoComplete="email"
            placeholder="tucorreo@empresa.com"
            value={email} onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Envelope aria-hidden />}
            invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
          />
          {errors.email && <p id="email-error" className="text-xs text-destructive">{errors.email}</p>}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Contraseña</Label>
            <button type="button" onClick={() => navigate("/forgot-password")}
              className="rounded text-xs font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
              ¿Olvidaste tu contraseña?
            </button>
          </div>
          <PasswordInput
            id="password" autoComplete="current-password" placeholder="Tu contraseña"
            value={password} onChange={(e) => setPassword(e.target.value)}
            leftIcon={<Lock aria-hidden />}
            invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
          />
          {errors.password && <p id="password-error" className="text-xs text-destructive">{errors.password}</p>}
        </div>

        <div className="flex items-center gap-2.5">
          <Checkbox id="remember" checked={remember} onCheckedChange={setRemember} />
          <Label htmlFor="remember" className="cursor-pointer font-normal text-muted-foreground">
            Mantener sesión iniciada
          </Label>
        </div>

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {loading ? "Verificando…" : "Iniciar sesión"}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-4">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">o</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-3">
        <Button variant="outline" size="lg" className="w-full" onClick={() => navigate("/signup")}>
          Crear cuenta
        </Button>
        <Button variant="whatsapp" size="lg" className="w-full" onClick={contactWhatsApp}>
          <WhatsappLogo className="size-[18px] text-wa" weight="fill" aria-hidden />
          Contáctanos por WhatsApp
        </Button>
      </div>

      <p className="mt-10 text-center text-xs text-muted-foreground lg:hidden">
        © {new Date().getFullYear()} Chateam. Todos los derechos reservados.
      </p>
    </div>
  );
}
