// Covers POST /api/schedules/generate against the standing-assignment
// model (seeds/010_standing_assignments.sql): one building_tasks row per
// available standing assignment, force/409 behavior, and retention
// pruning. Carry-forward/AM-PM-budget/trash-pairing coverage was removed
// here along with the APPA-ratio algorithm it tested - standing
// assignments are read fresh from custodian_assignments every call, there
// is nothing to carry forward.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { BuildingTask, DailySchedule } from "../shared/types";

const repoRoot = path.resolve(import.meta.dirname, "..");
const tmpDir = mkdtempSync(path.join(tmpdir(), "custodial-schedules-"));
const dbPath = path.join(tmpDir, "test.db");
process.env.DB_PATH = dbPath;

execFileSync("node", ["scripts/init-db.js", "--reset"], {
  cwd: repoRoot,
  env: { ...process.env, DB_PATH: dbPath },
  stdio: "ignore",
});

const { default: app } = await import("../server/app");
const db = await import("../server/db/index");

let baseUrl: string;
let close: () => Promise<void>;

async function json<T = Record<string, any>>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

before(async () => {
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
  close = () => new Promise<void>((resolve, reject) =>
    server.close(err => (err ? reject(err) : resolve())));
});

after(async () => {
  await close();
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // best-effort tmp-dir cleanup; see note in db-init.test.ts
  }
});

test("generate inserts one building_tasks row per standing assignment and GET exposes it under the right custodian", async () => {
  const result = await fetch(`${baseUrl}/api/schedules/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: "2031-04-01" }),
  }).then(json<{ tasks_created: number }>);
  assert.ok(result.tasks_created > 0);

  const phil = await db.get<{ id: number }>("SELECT id FROM custodians WHERE name = 'Phil'");
  const walt = await db.get<{ id: number; daily_hours_l2: number }>(
    "SELECT id, daily_hours_l2 FROM buildings WHERE name = 'WALT'");
  assert.ok(phil && walt, "expected Phil and WALT in seed data");

  const schedule = await fetch(`${baseUrl}/api/schedules?date=2031-04-01`).then(json<DailySchedule>);
  const philSchedule = schedule.custodians.find(c => c.id === phil!.id);
  assert.ok(philSchedule, "expected Phil to appear in the day's schedule");

  const waltTask = philSchedule!.tasks.find(t => t.building_id === walt!.id);
  assert.ok(waltTask, "expected WALT to be assigned to Phil");
  assert.equal(waltTask!.estimated_hours, walt!.daily_hours_l2);
});

test("generate refuses to overwrite an existing schedule unless force is set", async () => {
  const first = await fetch(`${baseUrl}/api/schedules/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: "2031-03-10" }),
  });
  assert.equal(first.status, 200);

  const conflict = await fetch(`${baseUrl}/api/schedules/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: "2031-03-10" }),
  });
  assert.equal(conflict.status, 409);

  const forced = await fetch(`${baseUrl}/api/schedules/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: "2031-03-10", force: true }),
  });
  assert.equal(forced.status, 200);

  const { tasks_created } = await forced.json() as { tasks_created: number };
  const count = await db.get<{ n: number }>(
    "SELECT count(*) as n FROM building_tasks WHERE schedule_date = '2031-03-10'");
  assert.equal(Number(count!.n), tasks_created, "force should replace, not duplicate, the existing tasks");
});

test("generate prunes schedule-dated rows older than the retention window", async () => {
  await db.run(
    "INSERT INTO disruptions (disruption_date, type, description) VALUES ('2000-01-01', 'callout', 'ancient')");
  const before_ = await db.get<{ n: number }>(
    "SELECT count(*) as n FROM disruptions WHERE description = 'ancient'");
  assert.equal(Number(before_!.n), 1);

  await fetch(`${baseUrl}/api/schedules/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: "2031-03-03" }),
  });

  const after_ = await db.get<{ n: number }>(
    "SELECT count(*) as n FROM disruptions WHERE description = 'ancient'");
  assert.equal(Number(after_!.n), 0, "disruption older than the retention window should have been pruned");
});

test("assign/unassign still work against standing-assignment-generated tasks", async () => {
  await fetch(`${baseUrl}/api/schedules/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: "2031-04-05", force: true }),
  });
  const schedule = await fetch(`${baseUrl}/api/schedules?date=2031-04-05`).then(json<DailySchedule>);
  const someTask = schedule.tasks.find((t: BuildingTask) => t.assigned_to);
  assert.ok(someTask, "expected at least one generated task to reassign");

  const otherCustodian = await db.get<{ id: number }>(
    "SELECT id FROM custodians WHERE active = 1 AND id != ? LIMIT 1", [someTask!.assigned_to!]);
  assert.ok(otherCustodian);

  const assignRes = await fetch(`${baseUrl}/api/schedules/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task_id: someTask!.id, custodian_id: otherCustodian!.id }),
  }).then(json<{ ok: boolean }>);
  assert.equal(assignRes.ok, true);

  const after_ = await db.get<{ assigned_to: number }>(
    "SELECT assigned_to FROM building_tasks WHERE id = ?", [someTask!.id]);
  assert.equal(after_!.assigned_to, otherCustodian!.id);
});
