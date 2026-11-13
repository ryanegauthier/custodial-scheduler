// Covers the standing-assignment-specific behavior of POST
// /api/schedules/generate and GET /api/schedules (seeds/010_standing_
// assignments.sql): per-assignment days_of_week filtering, coverage gaps
// when a custodian is unavailable, secondary assignments covering a
// primary's absence, and custodian_status date-range resolution. This
// file used to cover the old Team 1-6 fallback/AM-PM-budget algorithm,
// which no longer exists - replaced in full rather than patched.
//
// This needs its own db/app instance (not shared with schedules.test.ts)
// - server/db/index.ts reads DB_PATH once at import time, so a fresh
// process per file is what gives each test file its own db.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { DailySchedule } from "../shared/types";

const repoRoot = path.resolve(import.meta.dirname, "..");
const tmpDir = mkdtempSync(path.join(tmpdir(), "custodial-standing-"));
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

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
function dayOfWeek(date: string): string {
  return DAY_NAMES[new Date(`${date}T00:00:00`).getDay()];
}
// Find the next date on/after `fromDate` that falls on `targetDow`
// ('mon'..'sun'), scanning forward day by day - avoids hardcoding a
// literal date string whose weekday would have to be worked out by hand.
function nextDateOnDow(fromDate: string, targetDow: string): string {
  const d = new Date(`${fromDate}T00:00:00`);
  for (let i = 0; i < 7; i++) {
    if (DAY_NAMES[d.getDay()] === targetDow) return d.toISOString().slice(0, 10);
    d.setDate(d.getDate() + 1);
  }
  throw new Error(`no ${targetDow} found within a week of ${fromDate}`);
}

test("a days_of_week-restricted assignment only generates a task on its own days", async () => {
  const yuriy = await db.get<{ id: number }>("SELECT id FROM custodians WHERE name = 'Yuriy'");
  assert.ok(yuriy, "expected Yuriy (Tue-Sat only) in seed data");

  const monday = nextDateOnDow("2031-05-01", "mon");
  const tuesday = nextDateOnDow(monday, "tue");
  assert.equal(dayOfWeek(monday), "mon");
  assert.equal(dayOfWeek(tuesday), "tue");

  await fetch(`${baseUrl}/api/schedules/generate`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: monday }),
  });
  await fetch(`${baseUrl}/api/schedules/generate`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: tuesday }),
  });

  const mondaySchedule = await fetch(`${baseUrl}/api/schedules?date=${monday}`).then(json<DailySchedule>);
  const tuesdaySchedule = await fetch(`${baseUrl}/api/schedules?date=${tuesday}`).then(json<DailySchedule>);

  const mondayYuriy = mondaySchedule.custodians.find(c => c.id === yuriy!.id);
  const tuesdayYuriy = tuesdaySchedule.custodians.find(c => c.id === yuriy!.id);

  assert.equal(mondayYuriy?.tasks.length ?? 0, 0, "Yuriy should have no standing-assignment tasks on a Monday");
  assert.ok((tuesdayYuriy?.tasks.length ?? 0) > 0, "Yuriy should have his standing-assignment tasks on a Tuesday");
});

test("a callout on a building's only assignee produces a coverage gap", async () => {
  // With an empty coverage pool - otherwise an approved custodian picks
  // up WALT's restrooms/trash and it is no longer a gap (covered in
  // tests/schedules.test.ts). Approvals are restored at the end.
  const approved = await db.all<{ id: number }>("SELECT id FROM custodians WHERE coverage_approved = 1");
  await db.run("UPDATE custodians SET coverage_approved = 0");
  try {
    const phil = await db.get<{ id: number }>("SELECT id FROM custodians WHERE name = 'Phil'");
    const walt = await db.get<{ id: number; daily_hours_l2: number }>(
      "SELECT id, daily_hours_l2 FROM buildings WHERE name = 'WALT'");
    assert.ok(phil && walt, "expected Phil and WALT (Phil's sole standing assignment there) in seed data");

    const date = "2031-05-10";
    await fetch(`${baseUrl}/api/custodians/${phil!.id}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "callout", effective_date: date, end_date: date }),
    });

    await fetch(`${baseUrl}/api/schedules/generate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, force: true }),
    });

    const schedule = await fetch(`${baseUrl}/api/schedules?date=${date}`).then(json<DailySchedule>);
    const gap = schedule.coverage_gaps.find(g => g.building_id === walt!.id);
    assert.ok(gap, "expected WALT to show up as a coverage gap while Phil is called out");
    assert.equal(gap!.daily_hours, walt!.daily_hours_l2);
    assert.ok(gap!.unavailable.some(u => u.custodian_id === phil!.id && u.status === "callout"));

    const philSchedule = schedule.custodians.find(c => c.id === phil!.id);
    assert.ok(!philSchedule?.tasks.some(t => t.building_id === walt!.id),
      "Phil should not have a WALT task while called out");
  } finally {
    for (const a of approved) await db.run("UPDATE custodians SET coverage_approved = 1 WHERE id = ?", [a.id]);
  }
});

test("a secondary assignee covers the primary's absence - no gap, and the secondary gets the task", async () => {
  const olga = await db.get<{ id: number }>("SELECT id FROM custodians WHERE name = 'Olga'");
  const bobbiann = await db.get<{ id: number }>("SELECT id FROM custodians WHERE name = 'Bobbiann'");
  const weyerhaeuser = await db.get<{ id: number }>("SELECT id FROM buildings WHERE name = 'Weyerhaeuser Hall'");
  assert.ok(olga && bobbiann && weyerhaeuser,
    "expected Olga (primary) and Bobbiann (secondary) on Weyerhaeuser Hall in seed data");

  const date = "2031-05-11";
  await fetch(`${baseUrl}/api/custodians/${olga!.id}/status`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "vacation", effective_date: date, end_date: date }),
  });

  await fetch(`${baseUrl}/api/schedules/generate`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, force: true }),
  });

  const schedule = await fetch(`${baseUrl}/api/schedules?date=${date}`).then(json<DailySchedule>);
  assert.ok(!schedule.coverage_gaps.some(g => g.building_id === weyerhaeuser!.id),
    "Weyerhaeuser Hall should not be a gap - Bobbiann (secondary) is still active");

  const bobbiannSchedule = schedule.custodians.find(c => c.id === bobbiann!.id);
  assert.ok(bobbiannSchedule?.tasks.some(t => t.building_id === weyerhaeuser!.id),
    "expected Bobbiann to pick up Weyerhaeuser Hall while Olga is on vacation");
});

test("lowering a building's target_appa_level changes the hours generate assigns", async () => {
  const phil = await db.get<{ id: number }>("SELECT id FROM custodians WHERE name = 'Phil'");
  const walt = await db.get<{ id: number; daily_hours_l2: number; daily_hours_l3: number }>(
    "SELECT id, daily_hours_l2, daily_hours_l3 FROM buildings WHERE name = 'WALT'");
  assert.ok(phil && walt);
  assert.notEqual(walt!.daily_hours_l2, walt!.daily_hours_l3, "fixture assumes WALT's L2 and L3 hours differ");

  const patchRes = await fetch(`${baseUrl}/api/buildings/${walt!.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_appa_level: 3 }),
  });
  assert.equal(patchRes.status, 200);

  const date = "2031-05-20";
  await fetch(`${baseUrl}/api/schedules/generate`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, force: true }),
  });

  const schedule = await fetch(`${baseUrl}/api/schedules?date=${date}`).then(json<DailySchedule>);
  const philSchedule = schedule.custodians.find(c => c.id === phil!.id);
  const waltTask = philSchedule?.tasks.find(t => t.building_id === walt!.id);
  assert.ok(waltTask, "expected WALT to still be assigned to Phil at L3");
  assert.equal(waltTask!.estimated_hours, walt!.daily_hours_l3,
    "generate should use WALT's L3 hours now that its target_appa_level is 3, not L2");
});

test("an explicit active status row ends an earlier open-ended window early", async () => {
  const created = await fetch(`${baseUrl}/api/custodians`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test FMLA Person", shift_template_id: 1 }),
  }).then(json<{ id: number }>);

  await fetch(`${baseUrl}/api/custodians/${created.id}/status`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "fmla", notes: "open-ended, no dates" }),
  });

  const whileOnFmla = await fetch(`${baseUrl}/api/custodians/${created.id}/status?date=2031-06-01`)
    .then(json<{ status: string }>);
  assert.equal(whileOnFmla.status, "fmla");

  await fetch(`${baseUrl}/api/custodians/${created.id}/status`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "active", effective_date: "2031-06-15" }),
  });

  const beforeReturn = await fetch(`${baseUrl}/api/custodians/${created.id}/status?date=2031-06-10`)
    .then(json<{ status: string }>);
  assert.equal(beforeReturn.status, "fmla", "still fmla before the active row's effective_date");

  const afterReturn = await fetch(`${baseUrl}/api/custodians/${created.id}/status?date=2031-06-20`)
    .then(json<{ status: string }>);
  assert.equal(afterReturn.status, "active", "the dated active row should win over the open-ended fmla row");
});
