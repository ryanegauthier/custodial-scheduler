import { createClient, type InArgs, type InValue } from "@libsql/client";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../../data/custodial.db");

const db = createClient({ url: `file:${DB_PATH}` });

// Helper: run a query and return all rows synchronously-ish via promise
// We wrap libsql's async API to keep route handlers clean.
// Row shapes aren't validated here - callers assert the shape they expect
// via the generic (see shared/types.ts), matching the trusted-internal-SQL
// split described in shared/schemas.ts.

export async function all<T = Record<string, unknown>>(
  sql: string,
  params: InArgs = [] as InValue[],
): Promise<T[]> {
  const r = await db.execute({ sql, args: params });
  return r.rows as unknown as T[];
}

export async function get<T = Record<string, unknown>>(
  sql: string,
  params: InArgs = [] as InValue[],
): Promise<T | null> {
  const rows = await all<T>(sql, params);
  return rows[0] ?? null;
}

export async function run(sql: string, params: InArgs = [] as InValue[]) {
  return db.execute({ sql, args: params });
}

export async function exec(sql: string) {
  // Execute a multi-statement SQL string
  const statements = sql.split(";").map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await db.execute(stmt);
  }
}

export default { all, get, run, exec };

