import { createClient } from "@libsql/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../data/custodial.db");
const SEED_DIR = path.join(__dirname, "../seeds");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Remove old db so we start fresh
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
if (fs.existsSync(DB_PATH + "-wal")) fs.unlinkSync(DB_PATH + "-wal");
if (fs.existsSync(DB_PATH + "-shm")) fs.unlinkSync(DB_PATH + "-shm");

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
      if (e.message.includes("already exists") || e.message.includes("UNIQUE constraint")) {
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
