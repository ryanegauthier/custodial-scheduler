import { createClient } from "@libsql/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../data/custodial.db");
const SEED_DIR = path.join(__dirname, "../seeds");
const RESET = process.argv.includes("--reset");

// A caller that asks for --reset must actually get a wipe - silently
// keeping the old file (with its old data) would be worse than crashing.
// Retries only smooth over transient OS-level lock timing (seen on
// Windows right after a client closes), not a reason to give up on it.
async function unlinkRequired(filePath, attempts = 10, delayMs = 150) {
  if (!fs.existsSync(filePath)) return;
  for (let i = 0; i < attempts; i++) {
    try {
      fs.unlinkSync(filePath);
      return;
    } catch (e) {
      if (i === attempts - 1) throw e;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

if (RESET) {
  // Explicit full wipe, e.g. for local dev. Never done implicitly - a
  // redeploy running this same script via `npm run db:init` must not
  // erase production data, so a reset requires this flag on purpose.
  console.log("--reset passed: wiping existing db before reseeding");
  await unlinkRequired(DB_PATH);
  // WAL/SHM are auxiliary - best-effort only. Leaving a stale one behind
  // is harmless once the main db file above is actually gone.
  for (const suffix of ["-wal", "-shm"]) {
    try {
      if (fs.existsSync(DB_PATH + suffix)) fs.unlinkSync(DB_PATH + suffix);
    } catch (e) {
      console.warn(`  WARN: could not remove ${path.basename(DB_PATH + suffix)}: ${e.message}`);
    }
  }
} else {
  console.log(fs.existsSync(DB_PATH)
    ? "Existing db found - applying seeds idempotently (pass --reset to wipe instead)"
    : "No existing db - creating fresh");
}

const db = createClient({ url: `file:${DB_PATH}` });

// Simple statement splitter that respects single-quoted strings
function splitSQL(sql) {
  const stmts = [];
  let current = "";
  let inString = false;
  let inComment = false;
  let inLineComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inComment) {
      if (ch === "*" && next === "/") { inComment = false; i++; }
      continue;
    }
    if (!inString && ch === "-" && next === "-") { inLineComment = true; continue; }
    if (!inString && ch === "/" && next === "*") { inComment = true; i++; continue; }
    if (ch === "'" && !inString) { inString = true; current += ch; continue; }
    if (ch === "'" && inString) {
      inString = false; current += ch;
      if (next === "'") { current += sql[++i]; inString = true; } // escaped quote
      continue;
    }
    if (ch === ";" && !inString) {
      const stmt = current.trim();
      if (stmt) stmts.push(stmt);
      current = "";
      continue;
    }
    current += ch;
  }
  const last = current.trim();
  if (last) stmts.push(last);
  return stmts;
}

const seeds = fs.readdirSync(SEED_DIR).filter(f => f.endsWith(".sql")).sort();

for (const seed of seeds) {
  console.log(`Running: ${seed}`);
  const sql = fs.readFileSync(path.join(SEED_DIR, seed), "utf8");
  const statements = splitSQL(sql);
  let ok = 0, skip = 0;
  for (const stmt of statements) {
    if (!stmt || stmt.startsWith("--")) continue;
    try {
      await db.execute(stmt);
      ok++;
    } catch (e) {
      if (e.message.includes("already exists") || e.message.includes("UNIQUE constraint")
          || e.message.includes("duplicate column name")) {
        skip++;
      } else {
        console.warn(`  WARN: ${e.message.slice(0, 100)}`);
        console.warn(`  Stmt: ${stmt.slice(0, 80)}…`);
      }
    }
  }
  console.log(`  ${ok} executed, ${skip} skipped`);
}

// Verify
const bldCount = await db.execute("SELECT COUNT(*) as n FROM buildings");
const zoneCount = await db.execute("SELECT COUNT(*) as n FROM zones");
const spaceCount = await db.execute("SELECT COUNT(*) as n FROM building_spaces");
console.log(`\nDB ready:`);
console.log(`  Zones: ${zoneCount.rows[0].n}`);
console.log(`  Buildings: ${bldCount.rows[0].n}`);
console.log(`  Space rows: ${spaceCount.rows[0].n}`);

db.close();
