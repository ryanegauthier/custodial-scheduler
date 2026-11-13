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

// --- Coverage pool (seeds/012_coverage_pool.sql) ---
// WALT's only standing assignee is Phil, so calling him out leaves it
// uncovered. (Weyerhaeuser Hall would not work: Bobbiann is its secondary.)

async function generate(date: string) {
  return fetch(`${baseUrl}/api/schedules/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, force: true }),
  }).then(json<{ coverage_assigned: { building_id: number; custodian_id: number }[] }>);
}

async function callOut(name: string, date: string) {
  await db.run(
    `INSERT INTO custodian_status (custodian_id, status, effective_date, end_date)
     SELECT id, 'callout', ?, ? FROM custodians WHERE name = ?`, [date, date, name]);
}

async function walt() {
  return (await db.get<{ id: number; hours: number }>(
    `SELECT id, CASE COALESCE(target_appa_level, 2) WHEN 1 THEN daily_hours_l1
       WHEN 3 THEN daily_hours_l3 ELSE daily_hours_l2 END as hours
     FROM buildings WHERE name = 'WALT'`))!;
}

test("a called-out custodian's building gets only restroom/trash coverage (43%) from an approved custodian", async () => {
  const date = "2031-04-07";
  await callOut("Phil", date);
  const w = await walt();
  await generate(date);

  const tasks = await db.all<{ task_type_id: number; estimated_hours: number; assigned_to: number }>(
    "SELECT task_type_id, estimated_hours, assigned_to FROM building_tasks WHERE schedule_date = ? AND building_id = ?",
    [date, w.id]);
  assert.deepEqual(tasks.map(t => t.task_type_id).sort(), [2, 3, 4], "expected Restrooms + both Trash types only");
  assert.equal(new Set(tasks.map(t => t.assigned_to)).size, 1, "bundle should go to one person");
  const total = tasks.reduce((s, t) => s + t.estimated_hours, 0);
  assert.ok(Math.abs(total - w.hours * 0.43) < 0.01, `expected ~43% of ${w.hours}, got ${total}`);

  const coverer = await db.get<{ coverage_approved: number }>(
    "SELECT coverage_approved FROM custodians WHERE id = ?", [tasks[0].assigned_to]);
  assert.equal(coverer!.coverage_approved, 1);

  const schedule = await fetch(`${baseUrl}/api/schedules?date=${date}`).then(json<DailySchedule>);
  assert.ok(!schedule.coverage_gaps.some(g => g.building_id === w.id), "covered building should not be a gap");
});

test("coverage never pushes anyone past their shift's productive hours", async () => {
  const date = "2031-04-14";
  // Call out everyone with a standing assignment, so the pool is
  // oversubscribed.
  await db.run(
    `INSERT INTO custodian_status (custodian_id, status, effective_date, end_date)
     SELECT DISTINCT custodian_id, 'callout', ?, ? FROM custodian_assignments`, [date, date]);
  const result = await generate(date);
  assert.ok(result.coverage_assigned.length > 0, "expected some coverage to be assigned");

  const schedule = await fetch(`${baseUrl}/api/schedules?date=${date}`).then(json<DailySchedule>);
  for (const c of schedule.custodians) {
    const limit = (c.productive_min ?? 450) / 60;
    assert.ok(c.assigned_hours <= limit + 1e-9, `${c.name} has ${c.assigned_hours}h, limit ${limit}h`);
  }
  assert.ok(schedule.coverage_gaps.length > 0, "an oversubscribed pool should leave some gaps");
});

test("with nobody approved for coverage, the building stays a gap", async () => {
  const date = "2031-04-21";
  const approved = await db.all<{ id: number }>("SELECT id FROM custodians WHERE coverage_approved = 1");
  await db.run("UPDATE custodians SET coverage_approved = 0");
  try {
    await callOut("Phil", date);
    const w = await walt();
    const result = await generate(date);
    assert.equal(result.coverage_assigned.length, 0);
    const schedule = await fetch(`${baseUrl}/api/schedules?date=${date}`).then(json<DailySchedule>);
    assert.ok(schedule.coverage_gaps.some(g => g.building_id === w.id));
  } finally {
    for (const a of approved) await db.run("UPDATE custodians SET coverage_approved = 1 WHERE id = ?", [a.id]);
  }
});
