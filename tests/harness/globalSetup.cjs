// globalSetup del harness DB: arranca un Redis EFÍMERO (throwaway) en 6399 para que los flujos
// que await-ean colas Bull (verifyQueue → UpdateTicketService → stageClassifierQueue.add, etc.)
// resuelvan en vez de colgar. Aislado del Redis de prod (5000); sin persistencia (--save "" / no AOF).
// Si ya hay un Redis en 6399 (corrida previa), lo reusa y NO lo mata en teardown.
const { spawn, execSync } = require("child_process");
const fs = require("fs");

const PORT = 6399;
const PIDFILE = "/tmp/harness-redis-6399.pid";

const pingOk = () => {
  try { execSync(`redis-cli -p ${PORT} ping`, { stdio: "ignore" }); return true; } catch { return false; }
};

module.exports = async () => {
  // [2026-08-01] Si el entorno ya trae un REDIS_URI, ahí hay un Redis de verdad y
  // este arranque efímero sobra. Es el caso del CI, que levanta un service container
  // en 6379. Sin esta salida temprana el harness solo funcionaba en el NAS.
  if (process.env.REDIS_URI) return;

  if (pingOk()) { // ya activo → reusar, no somos dueños
    if (fs.existsSync(PIDFILE)) { try { fs.unlinkSync(PIDFILE); } catch {} }
    return;
  }
  try {
    const child = spawn(
      "redis-server",
      ["--port", String(PORT), "--save", "", "--appendonly", "no", "--dir", "/tmp"],
      { detached: true, stdio: "ignore" }
    );
    // OJO: si el binario no existe, spawn NO lanza aquí — emite un evento `error`
    // asíncrono que el try/catch de abajo no puede ver, y sin handler Node lo
    // convierte en excepción no capturada que MATA el proceso de jest. Eso es lo que
    // pasaba en el runner de GitHub, donde no hay redis-server: el step del
    // golden-master moría en 1 segundo, antes de ejecutar un solo test.
    child.on("error", err => {
      console.warn(
        `[harness] no se pudo lanzar redis-server (${err.message}); ` +
          "flujos con Bull pueden colgar"
      );
    });
    child.unref();
    for (let i = 0; i < 50 && !pingOk(); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (pingOk()) fs.writeFileSync(PIDFILE, String(child.pid)); // dueños → matar en teardown
    else console.warn("[harness] no se pudo arrancar Redis efímero en 6399; flujos con Bull pueden colgar");
  } catch (e) {
    console.warn(`[harness] redis-server no disponible (${e.message}); flujos con Bull pueden colgar`);
  }
};
