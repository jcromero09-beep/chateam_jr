import dotenv from "dotenv";

dotenv.config({
  path: process.env.NODE_ENV === "test" ? ".env.test" : ".env"
});

// [Auditoría · Ola 2] Enruta console.* por el logger (pino + sanitización).
// Debe ir aquí (bootstrap se importa primero en server-distributed y worker).
import "./utils/consoleToLogger";

// Los avisos del runtime (DeprecationWarning, MaxListenersExceeded…) NO son
// errores. El handler por defecto de Node los escribe con console.error, y la
// línea de arriba enruta console.error a logger.error — así, 1.088 avisos en 3
// días quedaban clasificados como ERROR y dejaban los 9 errores REALES en el
// 0,8% de las líneas. Esto los baja a `warn` y los deduplica.
// Va DESPUÉS de consoleToLogger: quita el handler por defecto, que es el que
// pasaba por el console.error ya enrutado.
import "./utils/processWarnings";
