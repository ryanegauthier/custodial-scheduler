import { Router } from "express";
import db from "../db/index";
import {
  assignTaskRequestSchema,
  generateScheduleRequestSchema,
  taskStatusRequestSchema,
  unassignTaskRequestSchema,
} from "../../shared/schemas";
import type {
  BuildingTask,
  CoverageGap,
  Custodian,
  CustodianSchedule,
  Disruption,
} from "../../shared/types";

const router = Router();

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

// Standing assignments carry a whole building's daily hours as one block
// (see seeds/010_standing_assignments.sql) rather than the old per-task-type
// APPA breakdown, so building_tasks rows generated from them all use this
// task type.
const STANDING_ASSIGNMENT_TASK_TYPE = 6;

// When nobody on a building's standing assignment is available, a
// coverage-pool custodian picks up only restrooms and trash (floors and
// vacuuming are skipped for the day). Shares are fractions of the
// building's daily hours: 43% total per user (2026-11-13), split in the
// same 30:15:12 proportions the old APPA-ratio algorithm used for these
// three task types (task_types ids 2-4).
const COVERAGE_TASK_SHARES: { taskTypeId: number; share: number }[] = [
  { taskTypeId: 2, share: 0.226 }, // Restrooms
  { taskTypeId: 3, share: 0.113 }, // Trash (Classrooms)
  { taskTypeId: 4, share: 0.091 }, // Trash (Common)
];
const COVERAGE_TASK_TYPE_IDS = COVERAGE_TASK_SHARES.map(s => s.taskTypeId);

// Fallback when a custodian has no shift template (productive_min null),
// matching shift_templates.productive_min's column default.
const DEFAULT_PRODUCTIVE_MIN = 450;

function dayOfWeek(date: string): string {
  return DAY_NAMES[new Date(`${date}T00:00:00`).getDay()];
}

function appliesToday(daysOfWeek: string | null, dow: string): boolean {
  if (!daysOfWeek) return true;
  return daysOfWeek.split(",").map(d => d.trim()).includes(dow);
}

interface AssignmentRow {
  id: number;
  custodian_id: number;
  building_id: number;
  assignment_type: "primary" | "secondary";
  days_of_week: string | null;
  notes: string | null;
  share_pct: number;
  custodian_name: string;
  building_name: string;
  zone_id: number | null;
  zone_name: string | null;
  zone_color: string | null;
  daily_hours_l1: number | null;
  daily_hours_l2: number | null;
  daily_hours_l3: number | null;
  target_appa_level: number | null;
}

// Hours at a building's own target_appa_level (defaults to L2, matching
// buildings.target_appa_level's column default) - not always L2, now that
// management can set a building to L1 or L3.
function hoursAtTargetLevel(
  row: Pick<AssignmentRow, "daily_hours_l1" | "daily_hours_l2" | "daily_hours_l3" | "target_appa_level">,
): { hours: number | null; level: number } {
  const level = row.target_appa_level ?? 2;
  const hours = level === 1 ? row.daily_hours_l1 : level === 3 ? row.daily_hours_l3 : row.daily_hours_l2;
  return { hours, level };
}

interface StatusRow {
  id: number;
  custodian_id: number;
  status: string;
  effective_date: string | null;
  end_date: string | null;
}

// A custodian is available on `date` unless the most specific status row
// covering that date says otherwise - absence of any covering row means
// active. An explicit 'active' row only matters for ending an earlier
// fmla/callout/vacation window early (most specific = non-null
// effective_date, then latest-starting, wins when more than one row
// covers the same date).
async function unavailableCustodianMap(date: string): Promise<Map<number, string>> {
  const rows = await db.all<StatusRow>(
    `SELECT id, custodian_id, status, effective_date, end_date FROM custodian_status
     WHERE (effective_date IS NULL OR effective_date <= ?)
       AND (end_date IS NULL OR end_date >= ?)`,
    [date, date]);

  const byCustodian = new Map<number, StatusRow[]>();
  for (const r of rows) {
    const list = byCustodian.get(r.custodian_id) ?? [];
    list.push(r);
    byCustodian.set(r.custodian_id, list);
  }

  const unavailable = new Map<number, string>();
  for (const [custodianId, list] of byCustodian) {
    list.sort((a, b) => {
      if (!a.effective_date && b.effective_date) return 1;
      if (a.effective_date && !b.effective_date) return -1;
      // Same start date: the newest record wins (e.g. a callout added
      // today over a "back from FMLA" active row that also starts today).
      return (b.effective_date ?? "").localeCompare(a.effective_date ?? "") || b.id - a.id;
    });
    const current = list[0];
    if (current.status !== "active") unavailable.set(custodianId, current.status);
  }
  return unavailable;
}

async function getAssignmentsForDate(date: string) {
  const assignments = await db.all<AssignmentRow>(`
    SELECT ca.*, c.name as custodian_name, b.name as building_name,
           b.zone_id, z.name as zone_name, z.color as zone_color,
           b.daily_hours_l1, b.daily_hours_l2, b.daily_hours_l3, b.target_appa_level
    FROM custodian_assignments ca
    JOIN custodians c ON c.id = ca.custodian_id AND c.active = 1
    JOIN buildings b ON b.id = ca.building_id AND b.closed = 0
    LEFT JOIN zones z ON z.id = b.zone_id
  `);
  const dow = dayOfWeek(date);
  const todays = assignments.filter(a => appliesToday(a.days_of_week, dow));
  const unavailable = await unavailableCustodianMap(date);
  return { assignments: todays, unavailable };
}

interface StandingTask { building_id: number; custodian_id: number; hours: number }

// Splits each building's daily hours across the standing assignments that
// apply on `date`, and reports the portion left uncovered by absences.
// Single source of truth for both POST /generate (the tasks) and the
// coverage-gap list (the gaps), so the two can't disagree.
//
// share_pct is a relative weight among the building's primaries *that
// apply that day*, not a fixed fraction: each gets hours * share /
// (sum of that day's primary shares). So 50/50 and 100/100 both split
// evenly, 60/40 splits 60/40, and a building whose second primary only
// works some days (e.g. Boppell: Randall all days, Yuriy Tue-Sat) is 100%
// Randall on Monday and split on Tue-Sat - without double-counting the
// building's hours on shared days.
//
// Absences: an unavailable primary's portion is "missing". Available
// secondaries take over the missing portion (split by their own
// share_pct); with none available it becomes a callout gap for just that
// portion (e.g. Olga out -> 50% of Warren). A building with only
// secondaries that day treats them as its primaries.
async function planStandingAssignments(date: string): Promise<{
  tasks: StandingTask[]; callouts: CoverageGap[]; assignedToday: Set<number>;
}> {
  const { assignments, unavailable } = await getAssignmentsForDate(date);

  const byBuilding = new Map<number, AssignmentRow[]>();
  for (const a of assignments) {
    const list = byBuilding.get(a.building_id) ?? [];
    list.push(a);
    byBuilding.set(a.building_id, list);
  }

  const weightSum = (rows: AssignmentRow[]) => rows.reduce((sum, r) => sum + Math.max(r.share_pct, 0), 0);
  const tasks: StandingTask[] = [];
  const callouts: CoverageGap[] = [];

  for (const rows of byBuilding.values()) {
    const first = rows[0];
    const { hours, level } = hoursAtTargetLevel(first);
    const buildingHours = hours ?? 0;

    const primaries = rows.filter(r => r.assignment_type === "primary");
    const covering = primaries.length ? primaries : rows;
    const backups = primaries.length ? rows.filter(r => r.assignment_type === "secondary") : [];

    // Every share 0 (or bad data): fall back to an even split.
    const total = weightSum(covering);
    const fraction = (r: AssignmentRow) =>
      total > 0 ? Math.max(r.share_pct, 0) / total : 1 / covering.length;

    let missing = 0;
    for (const r of covering) {
      if (unavailable.has(r.custodian_id)) missing += fraction(r);
      else tasks.push({ building_id: r.building_id, custodian_id: r.custodian_id, hours: buildingHours * fraction(r) });
    }
    if (missing <= 1e-9) continue;

    const availableBackups = backups.filter(r => !unavailable.has(r.custodian_id));
    if (availableBackups.length) {
      const backupTotal = weightSum(availableBackups);
      for (const r of availableBackups) {
        const f = backupTotal > 0 ? Math.max(r.share_pct, 0) / backupTotal : 1 / availableBackups.length;
        tasks.push({ building_id: r.building_id, custodian_id: r.custodian_id, hours: buildingHours * missing * f });
      }
      continue;
    }

    callouts.push({
      building_id: first.building_id,
      building_name: first.building_name,
      zone_id: first.zone_id,
      zone_name: first.zone_name,
      zone_color: first.zone_color,
      daily_hours: hours == null ? null : buildingHours * missing,
      uncovered_fraction: missing,
      target_appa_level: level,
      reason: "callout",
      unavailable: covering.filter(r => unavailable.has(r.custodian_id)).map(r => ({
        custodian_id: r.custodian_id,
        custodian_name: r.custodian_name,
        status: unavailable.get(r.custodian_id) ?? "unknown",
      })),
    });
  }

  callouts.sort((a, b) => (b.daily_hours ?? 0) - (a.daily_hours ?? 0));
  return { tasks, callouts, assignedToday: new Set(byBuilding.keys()) };
}

// A building (or the absent custodian's portion of a shared one) is a
// coverage gap when its standing assignee is unavailable and no secondary
// steps in, or when no standing assignment applies to it today. A
// building whose restroom/trash coverage tasks are assigned to someone
// for that date is no longer a gap; unassigning them (Schedule Board)
// makes it one again.
async function buildCoverageGaps(date: string): Promise<CoverageGap[]> {
  const covered = new Set((await db.all<{ building_id: number }>(
    `SELECT DISTINCT building_id FROM building_tasks
     WHERE schedule_date = ? AND assigned_to IS NOT NULL
       AND task_type_id IN (${COVERAGE_TASK_TYPE_IDS.join(",")})`,
    [date])).map(r => r.building_id));
  return (await buildUncoveredBuildings(date)).filter(g => !covered.has(g.building_id));
}

async function buildUncoveredBuildings(date: string): Promise<CoverageGap[]> {
  const { callouts: gaps, assignedToday } = await planStandingAssignments(date);

  // Buildings no standing assignment applies to today - never assigned,
  // or assigned only on other days (e.g. Graves Gym is Wed-Sun, so it is
  // unassigned on Mon/Tue).
  type BuildingRow = Pick<AssignmentRow, "building_id" | "building_name" | "zone_id" | "zone_name" |
    "zone_color" | "daily_hours_l1" | "daily_hours_l2" | "daily_hours_l3" | "target_appa_level">;
  const leftover = (await db.all<BuildingRow>(`
    SELECT b.id as building_id, b.name as building_name, b.zone_id, z.name as zone_name,
           z.color as zone_color, b.daily_hours_l1, b.daily_hours_l2, b.daily_hours_l3,
           b.target_appa_level
    FROM buildings b LEFT JOIN zones z ON z.id = b.zone_id
    WHERE b.closed = 0`))
    .filter(b => !assignedToday.has(b.building_id))
    .map((b): CoverageGap => {
      const { hours, level } = hoursAtTargetLevel(b);
      return {
        building_id: b.building_id,
        building_name: b.building_name,
        zone_id: b.zone_id,
        zone_name: b.zone_name,
        zone_color: b.zone_color,
        daily_hours: hours,
        uncovered_fraction: 1,
        target_appa_level: level,
        reason: "unassigned",
        unavailable: [],
      };
    })
    .sort((a, b) => (b.daily_hours ?? 0) - (a.daily_hours ?? 0));

  // Callouts first: generate fills coverage in this order, and a building
  // that normally gets cleaned daily takes priority over leftovers.
  return [...gaps, ...leftover];
}

router.get("/", async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);

  const custodians = await db.all<Custodian>(`SELECT c.*, s.name as shift_name, s.start_time, s.productive_min
    FROM custodians c LEFT JOIN shift_templates s ON s.id = c.shift_template_id
    WHERE c.active = 1 ORDER BY s.start_time, c.name`);

  const tasks = await db.all<BuildingTask>(`SELECT bt.*, tt.name as task_name, tt.priority, tt.is_disruptive,
    b.name as building_name, b.zone_id, z.name as zone_name, z.color as zone_color,
    c.name as custodian_name
    FROM building_tasks bt
    JOIN task_types tt ON tt.id = bt.task_type_id
    JOIN buildings b ON b.id = bt.building_id
    LEFT JOIN zones z ON z.id = b.zone_id
    LEFT JOIN custodians c ON c.id = bt.assigned_to
    WHERE bt.schedule_date = ? ORDER BY z.name, b.name, tt.priority`, [date]);

  const disruptions = await db.all<Disruption>(`SELECT d.*, c.name as custodian_name, b.name as building_name
    FROM disruptions d LEFT JOIN custodians c ON c.id = d.custodian_id
    LEFT JOIN buildings b ON b.id = d.building_id
    WHERE d.disruption_date = ? AND d.resolved = 0`, [date]);

  const custodianMap: Record<number, CustodianSchedule> = {};
  for (const c of custodians) {
    custodianMap[c.id] = { ...c, tasks: [], assigned_hours: 0 };
  }
  for (const t of tasks) {
    if (t.assigned_to && custodianMap[t.assigned_to]) {
      custodianMap[t.assigned_to].tasks.push(t);
      custodianMap[t.assigned_to].assigned_hours += t.estimated_hours;
    }
  }

  res.json({
    date,
    day_of_week: dayOfWeek(date),
    custodians: Object.values(custodianMap),
    tasks,
    disruptions,
    coverage_gaps: await buildCoverageGaps(date),
  });
});

// Schedule-dated data (building_tasks/disruptions/daily_coverage) older than
// this is pruned on each generate call - there's no cron runner in this app,
// and generate is the natural once-a-day touchpoint to hang cleanup off of.
const RETENTION_DAYS = 30;

router.post("/generate", async (req, res) => {
  const parsed = generateScheduleRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { date, force } = parsed.data;

  const existing = await db.get<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM building_tasks WHERE schedule_date = ?", [date]);
  if (existing && existing.cnt > 0) {
    if (!force) return res.status(409).json({ error: "Schedule already exists", count: existing.cnt });
    await db.run("DELETE FROM building_tasks WHERE schedule_date = ?", [date]);
  }

  await db.run("DELETE FROM building_tasks WHERE schedule_date < date('now', ?)", [`-${RETENTION_DAYS} days`]);
  await db.run("DELETE FROM disruptions WHERE disruption_date < date('now', ?)", [`-${RETENTION_DAYS} days`]);
  await db.run("DELETE FROM daily_coverage WHERE coverage_date < date('now', ?)", [`-${RETENTION_DAYS} days`]);

  // Standing assignments, split by share_pct and minus anyone on fmla/
  // callout/vacation (see planStandingAssignments). Uncovered portions
  // are handled by coverage below, or reported in coverage_gaps.
  const { tasks: standingTasks } = await planStandingAssignments(date);
  const { unavailable } = await getAssignmentsForDate(date);

  let tasksCreated = 0;
  const hoursByCustodian = new Map<number, number>();
  for (const t of standingTasks) {
    // Not rounded: a sole assignee must get exactly the building's hours.
    const hours = t.hours;
    await db.run(`INSERT INTO building_tasks
      (building_id, task_type_id, estimated_hours, schedule_date, status, assigned_to)
      VALUES (?, ?, ?, ?, 'assigned', ?)`,
      [t.building_id, STANDING_ASSIGNMENT_TASK_TYPE, hours, date, t.custodian_id]);
    hoursByCustodian.set(t.custodian_id, (hoursByCustodian.get(t.custodian_id) ?? 0) + hours);
    tasksCreated++;
  }

  // Coverage: each uncovered building gets its restroom and trash share
  // as one bundle, callout buildings first, then leftover (unassigned)
  // buildings, largest first within each. Two pools, per user
  // (2026-11-20):
  // - callout buildings -> coverage-approved custodians only (unapproved
  //   usually means limited physical capacity);
  // - leftover buildings -> any custodian with no standing assignment at
  //   all, approved or not. "At all", not "none today": a days-limited
  //   assignment usually mirrors the person's work week, so they would
  //   otherwise get leftovers on their days off.
  // Within a pool, the bundle goes to whoever has the most room left
  // under their shift's productive hours (standing and earlier coverage
  // hours count against it). A bundle nobody has room for stays a gap -
  // never split across people, never assigned over the limit.
  const candidates = (await db.all<{
    id: number; productive_min: number | null; coverage_approved: number; has_assignment: number;
  }>(
    `SELECT c.id, s.productive_min, c.coverage_approved,
       EXISTS (SELECT 1 FROM custodian_assignments ca WHERE ca.custodian_id = c.id) as has_assignment
     FROM custodians c
     LEFT JOIN shift_templates s ON s.id = c.shift_template_id
     WHERE c.active = 1`))
    .filter(p => !unavailable.has(p.id));
  const pools = {
    callout: candidates.filter(p => p.coverage_approved === 1),
    unassigned: candidates.filter(p => !p.has_assignment),
  };

  const coverageAssigned: {
    building_id: number; custodian_id: number; hours: number; reason: CoverageGap["reason"];
  }[] = [];
  for (const gap of await buildUncoveredBuildings(date)) {
    const pool = pools[gap.reason];
    const bundle = COVERAGE_TASK_SHARES.map(s => ({
      taskTypeId: s.taskTypeId,
      hours: +((gap.daily_hours ?? 0) * s.share).toFixed(3),
    }));
    const bundleHours = bundle.reduce((sum, t) => sum + t.hours, 0);
    if (bundleHours <= 0) continue;

    let best: { id: number; room: number } | null = null;
    for (const p of pool) {
      const room = (p.productive_min ?? DEFAULT_PRODUCTIVE_MIN) / 60 - (hoursByCustodian.get(p.id) ?? 0);
      if (room >= bundleHours && (!best || room > best.room)) best = { id: p.id, room };
    }
    if (!best) continue;

    for (const t of bundle) {
      await db.run(`INSERT INTO building_tasks
        (building_id, task_type_id, estimated_hours, schedule_date, status, assigned_to)
        VALUES (?, ?, ?, ?, 'assigned', ?)`,
        [gap.building_id, t.taskTypeId, t.hours, date, best.id]);
      tasksCreated++;
    }
    hoursByCustodian.set(best.id, (hoursByCustodian.get(best.id) ?? 0) + bundleHours);
    coverageAssigned.push({
      building_id: gap.building_id, custodian_id: best.id, hours: +bundleHours.toFixed(3), reason: gap.reason,
    });
  }

  res.json({
    ok: true,
    date,
    day_of_week: dayOfWeek(date),
    tasks_created: tasksCreated,
    coverage_assigned: coverageAssigned,
    coverage_gaps: await buildCoverageGaps(date),
  });
});

router.post("/assign", async (req, res) => {
  const parsed = assignTaskRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { task_id, custodian_id, scheduled_start, scheduled_end } = parsed.data;
  await db.run(`UPDATE building_tasks SET assigned_to = ?, scheduled_start = ?,
    scheduled_end = ?, status = 'assigned' WHERE id = ?`,
    [custodian_id, scheduled_start ?? null, scheduled_end ?? null, task_id]);
  res.json({ ok: true });
});

router.post("/unassign", async (req, res) => {
  const parsed = unassignTaskRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  await db.run(`UPDATE building_tasks SET assigned_to = NULL, scheduled_start = NULL,
    scheduled_end = NULL, status = 'unassigned' WHERE id = ?`, [parsed.data.task_id]);
  res.json({ ok: true });
});

router.patch("/task/:id/status", async (req, res) => {
  const parsed = taskStatusRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  await db.run("UPDATE building_tasks SET status = ? WHERE id = ?",
    [parsed.data.status, req.params.id]);
  res.json({ ok: true });
});

export default router;
