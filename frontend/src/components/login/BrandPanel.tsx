// [Fase2·G.2] Panel de marca del Login (design system). Portado del prototipo.
import {
  WhatsappLogo,
  InstagramLogo,
  ChatCircleDots,
  Sparkle,
} from "@phosphor-icons/react";

const channels = [
  { icon: WhatsappLogo, label: "WhatsApp Business API" },
  { icon: InstagramLogo, label: "Comentarios de Instagram y Facebook" },
  { icon: ChatCircleDots, label: "WebChat y bandeja multicanal" },
  { icon: Sparkle, label: "Automatización y respuestas con IA" },
];

export function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-brand-teal lg:flex lg:flex-col lg:justify-between lg:p-14 xl:p-16">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 100% 0%, #0a6275 0%, rgba(10,98,117,0) 55%), radial-gradient(90% 80% at 0% 100%, #003a48 0%, rgba(0,58,72,0) 60%)",
        }}
        aria-hidden
      />
      <div
        className="animate-float-slow pointer-events-none absolute -right-24 top-1/3 size-80 rounded-full bg-brand-cyan/20 blur-3xl"
        aria-hidden
      />

      <div className="relative">
        <img src="/logo-chateam.svg" alt="Chateam" className="h-10 w-auto" />
      </div>

      <div className="relative max-w-md">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-brand-cyan">
          Plataforma omnicanal
        </p>
        <h1 className="text-balance text-4xl font-bold leading-[1.1] text-white xl:text-[2.75rem]">
          Toda tu comunicación, en un solo lugar.
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-white/70">
          Gestiona conversaciones, tickets y campañas de cada canal desde una
          sola bandeja, con seguimiento de ventas y asistencia de IA.
        </p>

        <ul className="mt-9 space-y-3.5">
          {channels.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 text-white/85">
              <span className="flex size-9 items-center justify-center rounded-lg bg-white/10 text-brand-cyan ring-1 ring-inset ring-white/15">
                <Icon className="size-[18px]" weight="fill" aria-hidden />
              </span>
              <span className="text-sm">{label}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative text-xs text-white/45">
        © {new Date().getFullYear()} Chateam. Todos los derechos reservados.
      </p>
    </aside>
  );
}
