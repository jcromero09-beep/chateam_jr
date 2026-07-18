// globalTeardown del harness DB: mata el Redis efímero SOLO si lo arrancamos nosotros
// (el pidfile solo existe si globalSetup lo lanzó; si reusamos uno ajeno, no lo tocamos).
const fs = require("fs");
const PIDFILE = "/tmp/harness-redis-6399.pid";

module.exports = async () => {
  if (!fs.existsSync(PIDFILE)) return;
  try {
    const pid = parseInt(fs.readFileSync(PIDFILE, "utf8"), 10);
    if (pid > 0) process.kill(pid, "SIGTERM");
  } catch {}
  try { fs.unlinkSync(PIDFILE); } catch {}
};
