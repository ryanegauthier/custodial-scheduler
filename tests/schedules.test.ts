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
  }).then(json<{ coverage_assigned: { building_id: number; custodian_id: number; reason: string }[] }>);
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

test("with nobody approved for coverage, the callout building stays a gap", async () => {
  const date = "2031-04-21";
  const approved = await db.all<{ id: number }>("SELECT id FROM custodians WHERE coverage_approved = 1");
  await db.run("UPDATE custodians SET coverage_approved = 0");
  try {
    await callOut("Phil", date);
    const w = await walt();
    const result = await generate(date);
    // Leftover buildings still go to unassigned custodians (approval not
    // required); only callout coverage needs approval.
    assert.equal(result.coverage_assigned.filter(a => a.reason === "callout").length, 0);
    const schedule = await fetch(`${baseUrl}/api/schedules?date=${date}`).then(json<DailySchedule>);
    assert.ok(schedule.coverage_gaps.some(g => g.building_id === w.id && g.reason === "callout"));
  } finally {
    for (const a of approved) await db.run("UPDATE custodians SET coverage_approved = 1 WHERE id = ?", [a.id]);
  }
});

// --- Leftover buildings (no standing assignment applies that day) ---

async function custodiansWithoutAssignments() {
  return new Set((await db.all<{ id: number }>(
    `SELECT id FROM custodians WHERE active = 1
     AND id NOT IN (SELECT custodian_id FROM custodian_assignments)`)).map(r => r.id));
}

test("leftover buildings get restroom/trash coverage from unassigned custodians, approved or not", async () => {
  const date = "2031-04-23";
  const approved = await db.all<{ id: number }>("SELECT id FROM custodians WHERE coverage_approved = 1");
  await db.run("UPDATE custodians SET coverage_approved = 0");
  try {
    const result = await generate(date);
    const leftover = result.coverage_assigned.filter(a => a.reason === "unassigned");
    assert.ok(leftover.length > 0, "expected some leftover buildings to be covered with nobody approved");

    const unassigned = await custodiansWithoutAssignments();
    for (const a of leftover) {
      assert.ok(unassigned.has(a.custodian_id), `leftover went to custodian ${a.custodian_id}, who has a standing assignment`);
      const types = await db.all<{ task_type_id: number }>(
        "SELECT task_type_id FROM building_tasks WHERE schedule_date = ? AND building_id = ? ORDER BY task_type_id",
        [date, a.building_id]);
      assert.deepEqual(types.map(t => t.task_type_id), [2, 3, 4]);
    }

    const schedule = await fetch(`${baseUrl}/api/schedules?date=${date}`).then(json<DailySchedule>);
    // Only people who received coverage: standing-assignment hours alone
    // can already exceed a shift (see Known Issues on daily_hours_l2).
    const coverers = new Set(leftover.map(a => a.custodian_id));
    for (const c of schedule.custodians.filter(c => coverers.has(c.id))) {
      assert.ok(c.assigned_hours <= (c.productive_min ?? 450) / 60 + 1e-9, `${c.name} over the limit`);
    }
    for (const g of schedule.coverage_gaps) {
      assert.ok(!leftover.some(a => a.building_id === g.building_id), `${g.building_name} covered but still a gap`);
    }
  } finally {
    for (const a of approved) await db.run("UPDATE custodians SET coverage_approved = 1 WHERE id = ?", [a.id]);
  }
});

test("callout buildings are filled before leftovers when they compete for the same person", async () => {
  // Only Amos (no standing assignment) is approved; he is in both pools.
  // If leftovers were filled first, the large leftover buildings could
  // use up his hours before WALT's callout bundle got to him.
  const date = "2031-04-28";
  const approved = await db.all<{ id: number }>("SELECT id FROM custodians WHERE coverage_approved = 1");
  await db.run("UPDATE custodians SET coverage_approved = CASE WHEN name = 'Amos' THEN 1 ELSE 0 END");
  try {
    await callOut("Phil", date);
    const w = await walt();
    const result = await generate(date);
    const amos = await db.get<{ id: number }>("SELECT id FROM custodians WHERE name = 'Amos'");
    const waltCoverage = result.coverage_assigned.find(a => a.building_id === w.id);
    assert.ok(waltCoverage, "expected WALT to be covered");
    assert.equal(waltCoverage!.custodian_id, amos!.id);
    assert.equal(waltCoverage!.reason, "callout");
  } finally {
    await db.run("UPDATE custodians SET coverage_approved = 0");
    for (const a of approved) await db.run("UPDATE custodians SET coverage_approved = 1 WHERE id = ?", [a.id]);
  }
});

test("a building assigned only on some days is a leftover on its other days (Graves Gym: Wed-Sun)", async () => {
  const graves = await db.get<{ id: number }>("SELECT id FROM buildings WHERE name = 'Graves Gym'");
  assert.ok(graves);

  const monday = "2031-05-05";
  const mon = await generate(monday);
  const monSchedule = await fetch(`${baseUrl}/api/schedules?date=${monday}`).then(json<DailySchedule>);
  const coveredMon = mon.coverage_assigned.some(a => a.building_id === graves!.id && a.reason === "unassigned");
  const gapMon = monSchedule.coverage_gaps.some(g => g.building_id === graves!.id && g.reason === "unassigned");
  assert.ok(coveredMon || gapMon, "Graves Gym should be a leftover on Monday (covered or listed as a gap)");

  const wednesday = "2031-05-07";
  await generate(wednesday);
  const wedTypes = await db.all<{ task_type_id: number }>(
    "SELECT task_type_id FROM building_tasks WHERE schedule_date = ? AND building_id = ?", [wednesday, graves!.id]);
  assert.deepEqual(wedTypes.map(t => t.task_type_id), [6], "Wednesday should be Michael's standing assignment only");
});
