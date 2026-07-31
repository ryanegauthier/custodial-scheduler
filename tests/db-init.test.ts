// Regression test for a real bug: re-running `npm run db:init` against an
// existing db used to duplicate rows in tables whose seed INSERTs have no
// natural unique key (building_spaces, custodians, daily_coverage), because
// the runner only skips on "already exists" / "UNIQUE constraint" errors.
// Fixed by seeds/007_idempotent_indexes.sql.
//
// Each test below gets its own fresh db file. That's not just isolation
// hygiene: @libsql/client's local-file driver appears to hold an OS-level
// lock on a file for the rest of the process's life once anything in this
// process has called createClient() on it, even after .close(). Reusing a
// path across tests means a later --reset on that same path reliably
// EBUSYs on Windows. Subprocesses (via runInit/runSql) don't have this
// problem since the whole process exits, which guarantees the handle
// is released.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";

const repoRoot = path.resolve(import.meta.dirname, "..");
const tmpDirs: string[] = [];

function freshDbPath() {
  const dir = mkdtempSync(path.join(tmpdir(), "custodial-db-init-"));
  tmpDirs.push(dir);
  return path.join(dir, "test.db");
}

function runInit(dbPath: string, args: string[] = []) {
  execFileSync("node", ["scripts/init-db.js", ...args], {
    cwd: repoRoot,
    env: { ...process.env, DB_PATH: dbPath },
    stdio: "ignore",
  });
}

// Runs in a short-lived subprocess so the write's file handle is
// guaranteed released on exit - see the file-level comment above.
function runSql(dbPath: string, sql: string) {
  const escapedPath = dbPath.split("\\").join("\\\\");
  const script = `import{createClient}from"@libsql/client";const c=createClient({url:"file:${escapedPath}"});await c.execute(${JSON.stringify(sql)});c.close();`;
  execFileSync("node", ["--input-type=module", "-e", script], { cwd: repoRoot, stdio: "ignore" });
}

async function counts(dbPath: string) {
  const db = createClient({ url: `file:${dbPath}` });
  const [spaces, custodians, coverage] = await Promise.all([
    db.execute("SELECT count(*) as n FROM building_spaces"),
    db.execute("SELECT count(*) as n FROM custodians"),
    db.execute("SELECT count(*) as n FROM daily_coverage"),
  ]);
  db.close();
  return {
    spaces: Number(spaces.rows[0].n),
    custodians: Number(custodians.rows[0].n),
    coverage: Number(coverage.rows[0].n),
  };
}

after(() => {
  // Best-effort: this process has touched these files via createClient,
  // so on Windows the directory removal itself can transiently EBUSY.
  // It's tmp-dir hygiene, not part of what's being tested.
  for (const dir of tmpDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

test("db:init is idempotent across repeated runs", async () => {
  const dbPath = freshDbPath();

  runInit(dbPath, ["--reset"]);
  const first = await counts(dbPath);
  assert.ok(first.spaces > 0 && first.custodians > 0 && first.coverage > 0, "seed produced no data");

  runInit(dbPath);
  const second = await counts(dbPath);
  assert.deepEqual(second, first, "re-running db:init without --reset duplicated rows");

  runInit(dbPath);
  const third = await counts(dbPath);
  assert.deepEqual(third, first, "a third run duplicated rows");
});

test("--reset actually wipes prior data", async () => {
  const dbPath = freshDbPath();

  runInit(dbPath, ["--reset"]);
  runSql(dbPath, "INSERT INTO disruptions (disruption_date, type, description) VALUES ('2026-01-01', 'callout', 'marker')");
  runInit(dbPath, ["--reset"]);

  const r = await counts(dbPath); // sanity: still seeded
  assert.ok(r.custodians > 0);

  const db = createClient({ url: `file:${dbPath}` });
  const marker = await db.execute("SELECT count(*) as n FROM disruptions WHERE description = 'marker'");
  db.close();
  assert.equal(Number(marker.rows[0].n), 0, "--reset should have wiped the marker row");
});
