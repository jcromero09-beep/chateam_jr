/**
 * ResetPassword Page — Chateam Pro
 * Formulario para establecer nueva contrasena usando el token del email
 */

import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Lock, CheckCircle, WarningCircle, SignIn } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { cn } from '@/lib/utils'
import api from '../services/api'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  // Si no hay token en la URL, mostrar error
  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-[420px] rounded-lg border border-border bg-card p-8 shadow-lg">
          <div className="flex flex-col items-center gap-6">
            <WarningCircle className="size-14 text-destructive-text" weight="fill" aria-hidden />
            <h1 className="text-center text-lg font-semibold text-foreground">
              Enlace invalido
            </h1>
            <p className="text-center text-sm text-muted-foreground">
              Este enlace no contiene un token valido. Solicita un nuevo enlace de recuperacion.
            </p>
            <Link
              to="/forgot-password"
              className={cn(buttonVariants({ size: 'lg' }), 'w-full')}
            >
              Solicitar nuevo enlace
            </Link>
            <Link
              to="/login"
              className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'w-full')}
            >
              Volver al login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('La contrasena debe tener al menos 6 caracteres')
      return
    }
    if (password !== confirmPassword) {
      setError('Las contrasenas no coinciden')
      return
    }

    setLoading(true)
    try {
      const response = await api.post('/api/auth/reset-password', { token, password })
      if (response.data.success) {
        setSuccess(true)
        toast.success('Contrasena actualizada exitosamente')
      } else {
        setError(response.data.message || 'Error al restablecer la contrasena')
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      setError(error.response?.data?.message || 'Token invalido o expirado. Solicita un nuevo enlace.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      {/* Burbuja decorativa (token de marca) */}
      <div
        className="pointer-events-none absolute -right-[5%] -top-[10%] size-[400px] rounded-full bg-brand-cyan/8 blur-3xl"
        aria-hidden
      />

      <div className="relative z-[1] w-full max-w-[420px] rounded-lg border border-border bg-card p-6 shadow-lg sm:p-8">
        <div className="flex flex-col gap-6">
          {/* Logo */}
          <div className="flex flex-col items-center gap-2 pt-1">
            <img
              src="/logo.png"
              alt="Chateam"
              width={64}
              height={64}
              className="size-16"
            />
            <img
              src="/chateam-logo.png"
              alt="Chateam Pro"
              height={32}
              className="h-8 object-contain"
            />
            <p className="text-center text-sm text-muted-foreground">
              {success ? 'Contrasena actualizada' : 'Establece tu nueva contrasena'}
            </p>
          </div>

          <hr className="border-border" />

          {success ? (
            /* ═══ ESTADO: EXITO ═══ */
            <div className="flex flex-col items-center gap-5 py-2">
              <CheckCircle className="size-14 text-success-text" weight="fill" aria-hidden />
              <h1 className="text-center text-lg font-bold text-foreground">
                Contrasena actualizada
              </h1>
              <div className="flex w-full items-start gap-2 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success-text">
                <CheckCircle className="mt-0.5 size-5 shrink-0" aria-hidden />
                <span>
                  Tu contrasena se ha restablecido correctamente. Ya puedes iniciar sesion con tu nueva contrasena.
                </span>
              </div>
              <Button
                size="lg"
                onClick={() => navigate('/login')}
                className="w-full font-bold"
              >
                <SignIn className="size-5" aria-hidden />
                IR A INICIAR SESION
              </Button>
            </div>
          ) : (
            /* ═══ ESTADO: FORMULARIO ═══ */
            <form onSubmit={handleSubmit}>
              <div className="flex flex-col gap-5">
                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text"
                  >
                    <WarningCircle className="mt-0.5 size-5 shrink-0" aria-hidden />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new-password">Nueva Contrasena</Label>
                  <PasswordInput
                    id="new-password"
                    required
                    placeholder="Minimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    leftIcon={<Lock aria-hidden />}
                    autoFocus
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirm-password">Confirmar Contrasena</Label>
                  <PasswordInput
                    id="confirm-password"
                    required
                    placeholder="Repite tu contrasena"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    leftIcon={<Lock aria-hidden />}
                  />
                </div>

                <Button
                  type="submit"
                  loading={loading}
                  size="lg"
                  className="w-full font-bold"
                >
                  RESTABLECER CONTRASENA
                </Button>

                <Link
                  to="/login"
                  className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'w-full')}
                >
                  Volver al inicio de sesion
                </Link>
              </div>
            </form>
          )}

          <p className="text-center text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} CodigoPlus — Todos los derechos reservados
          </p>
        </div>
      </div>
    </div>
  )
}
