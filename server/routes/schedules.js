import { Router } from "express";
import db from "../db/index.js";

const router = Router();

router.get("/", async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  const custodians = await db.all(`SELECT c.*, s.name as shift_name, s.start_time, s.productive_min
    FROM custodians c LEFT JOIN shift_templates s ON s.id = c.shift_template_id
    WHERE c.active = 1 ORDER BY s.start_time, c.name`);

  const tasks = await db.all(`SELECT bt.*, tt.name as task_name, tt.priority, tt.is_disruptive,
    b.name as building_name, b.zone_id, z.name as zone_name, z.color as zone_color,
    c.name as custodian_name
    FROM building_tasks bt
    JOIN task_types tt ON tt.id = bt.task_type_id
    JOIN buildings b ON b.id = bt.building_id
    LEFT JOIN zones z ON z.id = b.zone_id
    LEFT JOIN custodians c ON c.id = bt.assigned_to
    WHERE bt.schedule_date = ? ORDER BY z.name, b.name, tt.priority`, [date]);

  const disruptions = await db.all(`SELECT d.*, c.name as custodian_name, b.name as building_name
    FROM disruptions d LEFT JOIN custodians c ON c.id = d.custodian_id
    LEFT JOIN buildings b ON b.id = d.building_id
    WHERE d.disruption_date = ? AND d.resolved = 0`, [date]);

  const custodianMap = {};
  for (const c of custodians) {
    custodianMap[c.id] = { ...c, tasks: [], assigned_hours: 0 };
  }
  for (const t of tasks) {
    if (t.assigned_to && custodianMap[t.assigned_to]) {
      custodianMap[t.assigned_to].tasks.push(t);
      custodianMap[t.assigned_to].assigned_hours += t.estimated_hours;
    }
  }

  const zones = await db.all("SELECT * FROM zones ORDER BY name");
  const zoneCoverage = await Promise.all(zones.map(async z => {
    const zoneBuildings = await db.all(
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

router.post("/generate", async (req, res) => {
  const { date } = req.body;
  if (!date) return res.status(400).json({ error: "date required" });

  const existing = await db.get(
    "SELECT COUNT(*) as cnt FROM building_tasks WHERE schedule_date = ?", [date]);
  if (existing.cnt > 0)
    return res.status(409).json({ error: "Schedule already exists", count: existing.cnt });

  const buildings = await db.all(
    "SELECT * FROM buildings WHERE daily_hours_l2 > 0 ORDER BY zone_id, daily_hours_l2 DESC");
  const taskTypes = await db.all("SELECT * FROM task_types ORDER BY priority");

  const ratios = { 1: 0.35, 2: 0.30, 3: 0.15, 4: 0.12, 5: 0.08 };

  for (const b of buildings) {
    for (const tt of taskTypes) {
      const hrs = +(b.daily_hours_l2 * (ratios[tt.id] || 0.1)).toFixed(3);
      if (hrs > 0.05) {
        await db.run(`INSERT INTO building_tasks
          (building_id, task_type_id, estimated_hours, schedule_date, status)
          VALUES (?, ?, ?, ?, 'unassigned')`, [b.id, tt.id, hrs, date]);
      }
    }
  }

  const count = await db.get(
    "SELECT COUNT(*) as cnt FROM building_tasks WHERE schedule_date = ?", [date]);
  res.json({ ok: true, date, tasks_created: count.cnt });
});

router.post("/assign", async (req, res) => {
  const { task_id, custodian_id, scheduled_start, scheduled_end } = req.body;
  await db.run(`UPDATE building_tasks SET assigned_to = ?, scheduled_start = ?,
    scheduled_end = ?, status = 'assigned' WHERE id = ?`,
    [custodian_id, scheduled_start, scheduled_end, task_id]);
  res.json({ ok: true });
});

router.post("/unassign", async (req, res) => {
  await db.run(`UPDATE building_tasks SET assigned_to = NULL, scheduled_start = NULL,
    scheduled_end = NULL, status = 'unassigned' WHERE id = ?`, [req.body.task_id]);
  res.json({ ok: true });
});

router.patch("/task/:id/status", async (req, res) => {
  await db.run("UPDATE building_tasks SET status = ? WHERE id = ?",
    [req.body.status, req.params.id]);
  res.json({ ok: true });
});

export default router;
