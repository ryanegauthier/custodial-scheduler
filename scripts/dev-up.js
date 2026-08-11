// Starts `npm run dev` (server + client via concurrently) detached from
// this process, logging to .dev.log and tracking the pid in .dev.pid so
// `npm run down` can find and stop the whole tree later.

import { spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PID_FILE = path.join(ROOT, ".dev.pid");
const LOG_FILE = path.join(ROOT, ".dev.log");

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

if (fs.existsSync(PID_FILE)) {
  const pid = Number(fs.readFileSync(PID_FILE, "utf8").trim());
  if (pid && isRunning(pid)) {
    console.log(`Dev server already running (pid ${pid}). Run "npm run down" first if you want to restart it.`);
    process.exit(0);
  }
  fs.unlinkSync(PID_FILE); // stale file from a previous run that already exited
}

let pid;

if (process.platform === "win32") {
  // Node's own child_process shell redirection didn't survive inheritance
  // through the npm -> concurrently -> tsx/vite chain in testing (servers
  // ran fine, but .dev.log stayed empty). Start-Process's own
  // -RedirectStandardOutput/-Error also can't both point at the same file
  // (Windows rejects that outright). Solution: let cmd's own `2>&1` merge
  // the streams into one file before Start-Process is even involved -
  // Start-Process just launches that already-self-redirecting cmd,
  // detached and hidden.
  const result = spawnSync("powershell", [
    "-NoProfile", "-Command",
    `$p = Start-Process cmd -ArgumentList '/c', 'npm run dev >> ".dev.log" 2>&1' ` +
    `-WorkingDirectory '${ROOT}' -WindowStyle Hidden -PassThru; $p.Id`,
  ]);
  pid = Number(result.stdout.toString().trim());
} else {
  const out = fs.openSync(LOG_FILE, "a");
  const child = spawn("npm", ["run", "dev"], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", out, out],
  });
  child.unref();
  pid = child.pid;
}

if (!pid) {
  console.error("Failed to start the dev server - no pid came back.");
  process.exit(1);
}

fs.writeFileSync(PID_FILE, String(pid));

console.log(`Dev server starting in background (pid ${pid}).`);
console.log(`Logs: ${LOG_FILE}`);
console.log(`Client: http://localhost:5173`);
console.log(`Stop with: npm run down`);
