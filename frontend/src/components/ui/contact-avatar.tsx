import { useState, useEffect } from "react";
import { Avatar } from "./avatar";
import { cn } from "@/lib/utils";

const sizeCls = {
  sm: "size-8",
  md: "size-10",
  lg: "size-11",
} as const;

/**
 * Foto del contacto con caida a iniciales ante CUALQUIER fallo de carga.
 *
 * El patron previo (`src ? <img/> : <Avatar/>`) solo cubria la URL vacia. Pero el
 * backend guarda `${FRONTEND_URL}/nopicture.png` cuando el contacto no tiene foto,
 * y ese fichero NO existe: la ruta devuelve el index.html de la SPA con
 * content-type text/html => el navegador pinta el icono de imagen rota.
 * Medido: 9 imagenes rotas en una sola pantalla de Tickets.
 */
export function ContactAvatar({
  src,
  name,
  size = "md",
  className,
}: {
  src?: string | null;
  name: string;
  size?: keyof typeof sizeCls;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  // Si cambia el contacto, volver a intentar con su foto.
  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return <Avatar name={name} size={size} className={className} />;
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn(sizeCls[size], "shrink-0 rounded-full object-cover", className)}
    />
  );
}
