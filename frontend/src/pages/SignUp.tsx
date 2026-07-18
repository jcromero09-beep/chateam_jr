import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { ArrowLeft, WhatsappLogo } from '@phosphor-icons/react'
import { toast } from 'react-toastify'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import api from '../services/api'

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: Record<string, unknown>) => void
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void
        }
      }
    }
  }
}

export default function SignUp() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    companyName: '',
    phone: '',
  })
  const [googleIdToken, setGoogleIdToken] = useState('')
  const [loading, setLoading] = useState(false)
  const googleButtonRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const referralSlug = searchParams.get('ref') || ''
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
  const whatsappNumber = import.meta.env.VITE_WHATSAPP_CONTACT || '5491234567890'

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current) return

    const initGoogle = () => {
      const googleId = window.google?.accounts?.id
      if (!googleId || !googleButtonRef.current) return

      googleId.initialize({
        client_id: googleClientId,
        callback: handleGoogleCredential,
      })
      googleId.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        width: 492,
        text: 'continue_with',
        locale: 'es',
      })
    }

    if (window.google?.accounts?.id) {
      initGoogle()
      return
    }

    const existingScript = document.getElementById('google-identity-services')
    if (existingScript) {
      existingScript.addEventListener('load', initGoogle, { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = 'google-identity-services'
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = initGoogle
    document.head.appendChild(script)
  }, [googleClientId])

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleGoogleCredential = async (response: { credential?: string }) => {
    if (!response.credential) {
      toast.error('No se pudo validar Google')
      return
    }

    try {
      const { data } = await api.post('/api/auth/google/verify', {
        credential: response.credential,
      })
      setGoogleIdToken(response.credential)
      setFormData(prev => ({
        ...prev,
        email: data.email || prev.email,
        name: prev.name || data.name || '',
      }))
      toast.success('Correo verificado con Google')
    } catch {
      setGoogleIdToken('')
      toast.error('No se pudo verificar tu correo con Google')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (formData.password !== formData.confirmPassword) {
      toast.error('Las contraseñas no coinciden')
      return
    }

    if (formData.password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }

    setLoading(true)

    try {
      await api.post('/api/auth/signup', {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        companyName: formData.companyName,
        phone: formData.phone,
        planId: 1,
        ...(googleIdToken ? { googleIdToken } : {}),
        ...(referralSlug ? { referralSlug, ref: referralSlug } : {}),
      })

      toast.success('¡Registro exitoso! Por favor inicia sesión')
      navigate('/login')
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string; error?: string } } }
      const errorMessage = err.response?.data?.message || err.response?.data?.error || 'Error al registrarse'
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleWhatsAppContact = () => {
    const message = encodeURIComponent('Hola, necesito ayuda con mi registro en Chateam')
    window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary to-primary-hover px-4 py-6">
      <div className="mx-2 w-full max-w-[540px] rounded-xl border border-border bg-card p-6 shadow-2xl shadow-black/40 sm:p-7">
        <div className="space-y-3">
          {/* Logo + Branding */}
          <div className="flex flex-col items-center gap-1.5">
            <img src="/logo.png" alt="ChatEAM" width={48} height={48} className="size-12" />
            <img src="/chateam-logo.png" alt="Chateam" height={18} className="h-[18px] w-auto" />
            <p className="text-xs text-muted-foreground">Registro de nueva cuenta</p>
            {referralSlug && (
              <span className="rounded-sm bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                Llegaste por una invitación: {referralSlug}
              </span>
            )}
          </div>

          <form onSubmit={handleSubmit}>
            <div className="space-y-2.5">
              {/* Fila 1: Nombre + Email */}
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="signup-name" className="text-[0.8rem]">
                    Nombre Completo
                  </Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="Juan Pérez"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="signup-email" className="text-[0.8rem]">
                    Correo Electrónico
                  </Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="tu@email.com"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              {/* Fila 2: Empresa + Teléfono */}
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="signup-company" className="text-[0.8rem]">
                    Nombre de Empresa
                  </Label>
                  <Input
                    id="signup-company"
                    type="text"
                    placeholder="Mi Empresa S.A."
                    value={formData.companyName}
                    onChange={(e) => handleChange('companyName', e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="signup-phone" className="text-[0.8rem]">
                    Teléfono / WhatsApp
                  </Label>
                  <Input
                    id="signup-phone"
                    type="tel"
                    placeholder="+54 9 11 1234-5678"
                    value={formData.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <div className="rounded-md bg-accent px-3 py-2 text-accent-foreground">
                <p className="text-sm font-semibold">Plan Demo incluido al inicio</p>
                <p className="text-xs">Podrás cambiar de plan después desde facturación.</p>
              </div>

              {googleClientId && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-border" aria-hidden />
                    <span className="text-xs text-muted-foreground">Verificación opcional</span>
                    <span className="h-px flex-1 bg-border" aria-hidden />
                  </div>
                  <div ref={googleButtonRef} className="flex min-h-10 justify-center [&>div]:max-w-full" />
                  {googleIdToken && (
                    <p className="text-center text-xs text-success-text">
                      Correo verificado con Google para el email de bienvenida.
                    </p>
                  )}
                </div>
              )}

              {/* Fila 3: Contraseña + Confirmar */}
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="signup-password" className="text-[0.8rem]">
                    Contraseña
                  </Label>
                  <PasswordInput
                    id="signup-password"
                    placeholder="Mínimo 6 caracteres"
                    value={formData.password}
                    onChange={(e) => handleChange('password', e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="signup-confirm" className="text-[0.8rem]">
                    Confirmar Contraseña
                  </Label>
                  <PasswordInput
                    id="signup-confirm"
                    placeholder="Repite tu contraseña"
                    value={formData.confirmPassword}
                    onChange={(e) => handleChange('confirmPassword', e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <Button type="submit" loading={loading} className="mt-0.5 w-full font-semibold">
                Crear Cuenta
              </Button>

              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border" aria-hidden />
                <span className="text-xs text-muted-foreground">o</span>
                <span className="h-px flex-1 bg-border" aria-hidden />
              </div>

              {/* WhatsApp + Volver en fila */}
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <Button
                  type="button"
                  variant="whatsapp"
                  size="sm"
                  className="w-full"
                  onClick={handleWhatsAppContact}
                >
                  <WhatsappLogo className="size-[18px]" weight="fill" aria-hidden />
                  WhatsApp
                </Button>
                <Link
                  to="/login"
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full')}
                >
                  <ArrowLeft className="size-[18px]" aria-hidden />
                  Volver al Login
                </Link>
              </div>
            </div>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            Al registrarte aceptas nuestros{' '}
            <span className="cursor-pointer text-primary hover:underline">
              Términos y Condiciones
            </span>{' '}
            y{' '}
            <span className="cursor-pointer text-primary hover:underline">
              Política de Privacidad
            </span>{' '}
            — Copyright {new Date().getFullYear()} CodigoPlus
          </p>
        </div>
      </div>
    </div>
  )
}
