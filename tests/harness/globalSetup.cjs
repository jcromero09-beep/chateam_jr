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
