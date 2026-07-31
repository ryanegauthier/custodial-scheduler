import { Router } from "express";
import db from "../db/index";
import {
  assignTaskRequestSchema,
  generateScheduleRequestSchema,
  taskStatusRequestSchema,
  unassignTaskRequestSchema,
} from "../../shared/schemas";
import type {
  Building,
  BuildingTask,
  Custodian,
  CustodianSchedule,
  Disruption,
  Zone,
  ZoneCoverage,
} from "../../shared/types";

interface TaskType {
  id: number;
  name: string;
  priority: number;
}

const router = Router();

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

  const zones = await db.all<Zone>("SELECT * FROM zones ORDER BY name");
  const zoneCoverage: ZoneCoverage[] = await Promise.all(zones.map(async z => {
    const zoneBuildings = await db.all<Pick<Building, "id" | "daily_hours_l2">>(
      "SELECT id, name, daily_hours_l2 FROM buildings WHERE zone_id = ?", [z.id]);
    const needed = zoneBuildings.reduce((s, b) => s + (b.daily_hours_l2 || 0), 0);
    const assigned = tasks.filter(t => t.zone_id === z.id && t.assigned_to)
      .reduce((s, t) => s + t.estimated_hours, 0);
    return { zone: z, hours_needed: +needed.toFixed(2), hours_assigned: +assigned.toFixed(2),
      gap: +(needed - assigned).toFixed(2) };
  }));

  res.json({
    date,
    custodians: Object.values(custodianMap),
    tasks,
    disruptions,
    zone_coverage: zoneCoverage,
    unassigned_tasks: tasks.filter(t => !t.assigned_to),
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

  const buildings = await db.all<Building>(
    "SELECT * FROM buildings WHERE daily_hours_l2 > 0 ORDER BY zone_id, daily_hours_l2 DESC");
  const taskTypes = await db.all<TaskType>("SELECT * FROM task_types ORDER BY priority");

  // Use the most recent prior schedule as a starting point: same
  // building+task assignments carry forward so the supervisor is
  // adjusting yesterday's plan rather than starting from a blank one.
  const prior = await db.get<{ last_date: string | null }>(
    "SELECT MAX(schedule_date) as last_date FROM building_tasks WHERE schedule_date < ?", [date]);

  const priorAssignments = new Map<string, number>();
  if (prior?.last_date) {
    const rows = await db.all<{ building_id: number; task_type_id: number; assigned_to: number }>(
      `SELECT bt.building_id, bt.task_type_id, bt.assigned_to
       FROM building_tasks bt
       JOIN custodians c ON c.id = bt.assigned_to AND c.active = 1
       WHERE bt.schedule_date = ? AND bt.assigned_to IS NOT NULL`, [prior.last_date]);
    for (const r of rows) priorAssignments.set(`${r.building_id}-${r.task_type_id}`, r.assigned_to);
  }

  // Every active custodian should have ~4 hours of "morning" work from
  // common (team-owned) buildings. Team rosters/assignments come from a
  // set of example whiteboards, not a hard constraint, so nobody gets
  // priority based on which team nominally owns a building - each common
  // task just goes to whichever active custodian currently has the fewest
  // hours so far. Anything a custodian gets after already reaching 4
  // hours is tagged "afternoon" instead, same as all residential-building
  // tasks (no team owns those, so they're tagged but left unassigned -
  // residential assignment is a follow-up, not solved here).
  const AM_TARGET_HOURS = 4;

  const teamBuildingRows = await db.all<{ building_id: number }>(
    "SELECT DISTINCT building_id FROM team_buildings");
  const commonBuildingIds = new Set(teamBuildingRows.map(r => r.building_id));

  const activeCustodians = await db.all<{ id: number }>("SELECT id FROM custodians WHERE active = 1 ORDER BY id");
  const hours = new Map<number, number>();
  for (const c of activeCustodians) hours.set(c.id, 0);

  function pickAssignee(): number | null {
    if (activeCustodians.length === 0) return null;
    return activeCustodians.reduce((least, c) =>
      (hours.get(c.id)! < hours.get(least.id)! ? c : least)).id;
  }

  // Single pass, in building/task-type order: carried-forward and fresh
  // assignments both accumulate into the same running `hours` totals, so
  // whichever comes first for a given custodian is what fills their AM
  // budget - there's no separate pre-seeding step to get out of sync with.
  const ratios: Record<number, number> = { 1: 0.35, 2: 0.30, 3: 0.15, 4: 0.12, 5: 0.08 };
  let carriedForward = 0;
  let freshAssigned = 0;

  for (const b of buildings) {
    for (const tt of taskTypes) {
      const hrs = +((b.daily_hours_l2 || 0) * (ratios[tt.id] || 0.1)).toFixed(3);
      if (hrs <= 0.05) continue;

      const isResidential = !commonBuildingIds.has(b.id);
      const carried = priorAssignments.get(`${b.id}-${tt.id}`) ?? null;
      let assignedTo: number | null = null;
      let period: "morning" | "afternoon" = "afternoon";

      if (carried && hours.has(carried)) {
        assignedTo = carried;
        carriedForward++;
        if (!isResidential) {
          const before = hours.get(assignedTo)!;
          period = before < AM_TARGET_HOURS ? "morning" : "afternoon";
          hours.set(assignedTo, before + hrs);
        }
      } else if (!isResidential) {
        assignedTo = pickAssignee();
        if (assignedTo != null) {
          const before = hours.get(assignedTo)!;
          period = before < AM_TARGET_HOURS ? "morning" : "afternoon";
          hours.set(assignedTo, before + hrs);
          freshAssigned++;
        }
      }

      await db.run(`INSERT INTO building_tasks
        (building_id, task_type_id, estimated_hours, schedule_date, status, assigned_to, period)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [b.id, tt.id, hrs, date, assignedTo ? "assigned" : "unassigned", assignedTo, period]);
    }
  }

  const count = await db.get<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM building_tasks WHERE schedule_date = ?", [date]);
  res.json({
    ok: true,
    date,
    tasks_created: count?.cnt ?? 0,
    carried_forward: carriedForward,
    carried_forward_from: carriedForward > 0 ? prior?.last_date : null,
    fresh_assigned: freshAssigned,
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
