import { createClient } from "@libsql/client";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../../data/custodial.db");

const db = createClient({ url: `file:${DB_PATH}` });

// Helper: run a query and return all rows synchronously-ish via promise
// We wrap libsql's async API to keep route handlers clean

export async function all(sql, params = []) {
  const r = await db.execute({ sql, args: params });
  return r.rows;
}

export async function get(sql, params = []) {
  const rows = await all(sql, params);
  return rows[0] ?? null;
}

export async function run(sql, params = []) {
  return db.execute({ sql, args: params });
}

export async function exec(sql) {
  // Execute a multi-statement SQL string
  const statements = sql.split(";").map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await db.execute(stmt);
  }
}

export default { all, get, run, exec };

