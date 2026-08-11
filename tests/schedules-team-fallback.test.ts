// Covers the AM/PM fallback logic in POST /api/schedules/generate: every
// active custodian - team member or not - should get pulled into common
// (team-owned) building work up to a ~4hr "morning" budget. Nobody gets
// priority based on which team nominally owns a building; each task just
// goes to whoever currently has the fewest hours. Anything beyond 4
// hours, plus all residential-building tasks, is tagged "afternoon".
//
// This needs its own db/app instance (not shared with schedules.test.ts)
// so "first schedule ever" is actually true here - server/db/index.ts
// reads DB_PATH once at import time, so a fresh process per file is what
// gives each test file its own db.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { BuildingTask } from "../shared/types";

const repoRoot = path.resolve(import.meta.dirname, "..");
const tmpDir = mkdtempSync(path.join(tmpdir(), "custodial-team-fallback-"));
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

test("first-ever generate gives every active custodian, including no-team ones, some morning work", async () => {
  const result = await fetch(`${baseUrl}/api/schedules/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: "2031-01-01" }),
  }).then(json<{ carried_forward: number; fresh_assigned: number }>);
  assert.equal(result.carried_forward, 0, "first-ever schedule has nothing to carry forward");
  assert.ok(result.fresh_assigned > 0);

  const schedule = await fetch(`${baseUrl}/api/schedules?date=2031-01-01`).then(json<{ tasks: BuildingTask[] }>);

  const noTeamCustodians = await db.all<{ id: number; name: string }>(
    "SELECT id, name FROM custodians WHERE active = 1 AND team_id IS NULL");
  assert.ok(noTeamCustodians.length > 0, "expected seed data to include no-team custodians (Carlie/Joe/Veronica/Brandon)");
  for (const c of noTeamCustodians) {
    const assignedHours = schedule.tasks
      .filter(t => t.assigned_to === c.id)
      .reduce((sum, t) => sum + t.estimated_hours, 0);
    assert.ok(assignedHours > 0, `expected ${c.name} (no team) to receive some common-building work`);
  }
});

test("morning tasks stay near the 4-hour budget per custodian; overflow is tagged afternoon", async () => {
  const schedule = await fetch(`${baseUrl}/api/schedules?date=2031-01-01`).then(json<{ tasks: BuildingTask[] }>);

  const morningHoursByCustodian = new Map<number, number>();
  for (const t of schedule.tasks) {
    if (t.period === "morning" && t.assigned_to) {
      morningHoursByCustodian.set(t.assigned_to, (morningHoursByCustodian.get(t.assigned_to) ?? 0) + t.estimated_hours);
    }
  }
  assert.ok(morningHoursByCustodian.size > 0, "expected at least some morning-tagged tasks");
  for (const [custodianId, total] of morningHoursByCustodian) {
    // The task that crosses the 4hr line still counts as morning, so this
    // allows some slack rather than an exact cap.
    assert.ok(total < 8, `custodian ${custodianId} has ${total}h of morning work, budget is ~4h`);
  }

  const hasAfternoon = schedule.tasks.some(t => t.period === "afternoon");
  assert.ok(hasAfternoon, "expected some tasks to overflow into afternoon");
});

test("residential buildings are tagged afternoon and left unassigned", async () => {
  const schedule = await fetch(`${baseUrl}/api/schedules?date=2031-01-01`).then(json<{ tasks: BuildingTask[] }>);
  const residentialBuildingIds = new Set(
    (await db.all<{ id: number }>(
      `SELECT b.id FROM buildings b
       WHERE b.id NOT IN (SELECT building_id FROM team_buildings)`)).map(r => r.id),
  );
  const residentialTasks = schedule.tasks.filter(t => residentialBuildingIds.has(t.building_id));
  assert.ok(residentialTasks.length > 0, "expected residential buildings to still generate tasks");
  for (const t of residentialTasks) {
    assert.equal(t.period, "afternoon");
    assert.equal(t.assigned_to, null);
  }
});

test("fallback spreads a team's buildings across multiple custodians instead of piling onto one person", async () => {
  // No priority is given to a building's nominal team, but least-hours
  // assignment should still naturally spread the work out - not always
  // the same single custodian picking up every task.
  const team1 = await db.get<{ id: number }>("SELECT id FROM teams WHERE name = 'Team 1'");
  assert.ok(team1);

  const schedule = await fetch(`${baseUrl}/api/schedules?date=2031-01-01`).then(json<{ tasks: BuildingTask[] }>);
  const team1BuildingIds = new Set(
    (await db.all<{ building_id: number }>(
      "SELECT building_id FROM team_buildings WHERE team_id = ?", [team1!.id])).map(r => r.building_id),
  );
  const assignedTo = new Set(
    schedule.tasks.filter(t => team1BuildingIds.has(t.building_id) && t.assigned_to).map(t => t.assigned_to),
  );
  assert.ok(assignedTo.size > 1, "expected Team 1's buildings to be handled by more than one custodian");
});

test("Trash (Common) always mirrors Trash (Classrooms)'s assignee and period", async () => {
  const schedule = await fetch(`${baseUrl}/api/schedules?date=2031-01-01`).then(json<{ tasks: BuildingTask[] }>);
  const byBuilding = new Map<number, BuildingTask[]>();
  for (const t of schedule.tasks) {
    if (!byBuilding.has(t.building_id)) byBuilding.set(t.building_id, []);
    byBuilding.get(t.building_id)!.push(t);
  }

  let pairsChecked = 0;
  for (const [buildingId, tasks] of byBuilding) {
    const roomTrash = tasks.find(t => t.task_type_id === 3);
    const commonTrash = tasks.find(t => t.task_type_id === 4);
    if (!roomTrash || !commonTrash) continue;
    pairsChecked++;
    assert.equal(commonTrash.assigned_to, roomTrash.assigned_to,
      `building ${buildingId}: common-area trash should go to the same person as room trash`);
    assert.equal(commonTrash.period, roomTrash.period,
      `building ${buildingId}: common-area trash should share room trash's AM/PM period`);
  }
  assert.ok(pairsChecked > 0, "expected at least one building with both trash task types to check");
});

test("buildings over the team-clean threshold split restrooms from the trash pair", async () => {
  // Robinson Science Hall is ~10.7 daily hours - well over the 4hr
  // team-clean threshold, so restrooms should go to someone other than
  // whoever has the trash pair.
  const robinson = await db.get<{ id: number }>("SELECT id FROM buildings WHERE name = 'Robinson Science Hall'");
  assert.ok(robinson);

  const schedule = await fetch(`${baseUrl}/api/schedules?date=2031-01-01`).then(json<{ tasks: BuildingTask[] }>);
  const tasks = schedule.tasks.filter(t => t.building_id === robinson!.id);
  const roomTrash = tasks.find(t => t.task_type_id === 3);
  const restrooms = tasks.find(t => t.task_type_id === 2);
  assert.ok(roomTrash && restrooms, "expected Robinson Science Hall to have both trash and restroom tasks");
  assert.notEqual(restrooms!.assigned_to, roomTrash!.assigned_to,
    "a >4hr building should split restrooms from whoever has the trash pair");
});
