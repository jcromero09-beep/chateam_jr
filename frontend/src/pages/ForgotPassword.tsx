/**
 * ForgotPassword Page — Chateam Pro
 * Formulario para solicitar enlace de recuperacion de contrasena via email
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Envelope,
  CheckCircle,
  PaperPlaneTilt,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import api from '../services/api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      toast.error('Ingresa tu correo electronico')
      return
    }

    setLoading(true)
    try {
      await api.post('/api/auth/forgot-password', { email: email.trim() })
      setSent(true)
    } catch {
      // Siempre mostrar exito por seguridad (no revelar si el email existe)
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      {/* Burbujas decorativas */}
      <span
        className="pointer-events-none absolute -right-[5%] -top-[10%] size-[400px] rounded-full bg-primary/[0.07] blur-3xl"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute -bottom-[15%] -left-[10%] size-[500px] rounded-full bg-brand-cyan/[0.06] blur-3xl"
        aria-hidden
      />

      <div className="relative z-[1] w-full max-w-[420px] rounded-xl border border-border bg-card p-6 shadow-2xl shadow-black/20 sm:p-8">
        <div className="space-y-6">
          {/* Logo */}
          <div className="flex flex-col items-center gap-2 pt-1">
            <img
              src="/logo.png"
              alt="Chateam"
              width={64}
              height={64}
              className="drop-shadow-[0_4px_12px_rgba(0,81,102,0.3)]"
            />
            <img
              src="/chateam-logo.png"
              alt="Chateam Pro"
              className="h-8 w-auto object-contain"
            />
            <p className="text-center text-sm text-muted-foreground">
              Recuperacion de contrasena
            </p>
          </div>

          <div className="border-t border-border" />

          {sent ? (
            /* ═══ ESTADO: EMAIL ENVIADO ═══ */
            <div className="flex flex-col items-center gap-5 py-2">
              <CheckCircle
                className="size-14 text-success-text"
                weight="fill"
                aria-hidden
              />
              <h1 className="text-center text-xl font-bold text-foreground">
                Revisa tu correo
              </h1>
              <div className="w-full rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success-text">
                Si <strong>{email}</strong> esta registrado, recibiras un enlace
                para restablecer tu contrasena. El enlace expira en 30 minutos.
              </div>
              <p className="text-center text-sm text-muted-foreground">
                No olvides revisar la carpeta de spam o correo no deseado.
              </p>

              <div className="flex w-full flex-col gap-3 pt-1">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setSent(false)
                    setEmail('')
                  }}
                >
                  Enviar a otro correo
                </Button>
                <Link
                  to="/login"
                  className={cn(buttonVariants({ variant: 'ghost' }), 'w-full')}
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  Volver al inicio de sesion
                </Link>
              </div>
            </div>
          ) : (
            /* ═══ ESTADO: FORMULARIO ═══ */
            <form onSubmit={handleSubmit}>
              <div className="space-y-5">
                <p className="text-sm text-muted-foreground">
                  Ingresa el correo electronico asociado a tu cuenta y te
                  enviaremos un enlace para restablecer tu contrasena.
                </p>

                <div className="space-y-1.5">
                  <Label htmlFor="forgot-email">Correo Electronico</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    leftIcon={<Envelope aria-hidden />}
                    autoFocus
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full font-bold"
                  loading={loading}
                  size="lg"
                >
                  {!loading && <PaperPlaneTilt className="size-5" aria-hidden />}
                  ENVIAR ENLACE
                </Button>

                <Link
                  to="/login"
                  className={cn(buttonVariants({ variant: 'ghost' }), 'w-full')}
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  Volver al inicio de sesion
                </Link>
              </div>
            </form>
          )}

          <p className="text-center text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} CodigoPlus — Todos los derechos
            reservados
          </p>
        </div>
      </div>
    </div>
  )
}
