// Stops whatever `npm run up` started, using the pid recorded in .dev.pid.
// Kills the whole tree (npm -> concurrently -> tsx/vite), not just the
// top-level pid, since none of those alone would take the others with it.

import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PID_FILE = path.join(ROOT, ".dev.pid");

if (!fs.existsSync(PID_FILE)) {
  console.log("No .dev.pid found - dev server doesn't look like it's running via \"npm run up\".");
  process.exit(0);
}

const pid = Number(fs.readFileSync(PID_FILE, "utf8").trim());
fs.unlinkSync(PID_FILE);

if (!pid) {
  console.log("PID file was empty or invalid - nothing to stop.");
  process.exit(0);
}

const DEV_PORTS = [3001, 5173];

if (process.platform === "win32") {
  const r = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "inherit" });
  if (r.status === 0) console.log(`Stopped dev server (pid ${pid}).`);
  else console.log(`taskkill exited ${r.status} - process may have already stopped.`);

  // tsx watch's own hot-reload restart can spawn a server process that
  // escapes the tree taskkill just walked (seen in practice on Windows -
  // /T only follows Win32 job/parent tracking, and that respawn doesn't
  // always stay attached to it). Sweep anything still on our dev ports.
  for (const port of DEV_PORTS) {
    const out = spawnSync("powershell", ["-NoProfile", "-Command",
      `(Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue).OwningProcess`,
    ]).stdout.toString().trim();
    for (const strayPid of new Set(out.split(/\s+/).filter(Boolean))) {
      console.log(`Port ${port} still held by pid ${strayPid} - stopping it too.`);
      spawnSync("taskkill", ["/PID", strayPid, "/T", "/F"], { stdio: "inherit" });
    }
  }
} else {
  try {
    process.kill(-pid, "SIGTERM"); // negative pid: whole process group
    console.log(`Stopped dev server (pid ${pid}).`);
  } catch (e) {
    console.log(`Could not stop pid ${pid} (it may have already exited): ${e.message}`);
  }
}
