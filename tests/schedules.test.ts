// Covers POST /api/schedules/generate: carrying forward the previous
// schedule's assignments onto a newly generated date, and pruning
// schedule-dated rows older than the retention window.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { BuildingTask } from "../shared/types";

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

test("generate carries forward the previous day's assignments", async () => {
  const dayOne = await fetch(`${baseUrl}/api/schedules/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: "2031-03-01" }),
  }).then(json<{ tasks_created: number; carried_forward: number }>);
  assert.equal(dayOne.carried_forward, 0, "first-ever schedule has nothing to carry forward");
  assert.ok(dayOne.tasks_created > 0);

  const scheduleOne = await fetch(`${baseUrl}/api/schedules?date=2031-03-01`)
    .then(json<{ unassigned_tasks: BuildingTask[] }>);
  const task = scheduleOne.unassigned_tasks[0];
  assert.ok(task, "expected at least one unassigned task to test with");

  const custodian = await db.get<{ id: number }>("SELECT id FROM custodians WHERE active = 1 LIMIT 1");
  assert.ok(custodian, "expected at least one active custodian in seed data");

  const assignRes = await fetch(`${baseUrl}/api/schedules/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task_id: task.id, custodian_id: custodian!.id }),
  }).then(json<{ ok: boolean }>);
  assert.equal(assignRes.ok, true);

  const dayTwo = await fetch(`${baseUrl}/api/schedules/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: "2031-03-02" }),
  }).then(json<{ carried_forward: number; carried_forward_from: string | null }>);
  assert.equal(dayTwo.carried_forward_from, "2031-03-01");
  assert.ok(dayTwo.carried_forward >= 1, "expected the assignment made on day one to carry forward");

  const scheduleTwo = await fetch(`${baseUrl}/api/schedules?date=2031-03-02`)
    .then(json<{ tasks: BuildingTask[] }>);
  const carriedTask = scheduleTwo.tasks.find(
    t => t.building_id === task.building_id && t.task_type_id === task.task_type_id,
  );
  assert.ok(carriedTask, "expected the same building+task_type to exist in day two's schedule");
  assert.equal(carriedTask!.assigned_to, custodian!.id, "carried-forward task should keep the same custodian");
  assert.equal(carriedTask!.status, "assigned");
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
