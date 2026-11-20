import { Router } from "express";
import db from "../db/index";
import { buildingUpdateRequestSchema } from "../../shared/schemas";
import type { Building, BuildingDetail, BuildingMapPoint, BuildingTask } from "../../shared/types";

const router = Router();

router.get("/", async (req, res) => {
  const { zone_id, category } = req.query;
  let sql = `SELECT b.*, z.name as zone_name, z.color as zone_color
    FROM buildings b LEFT JOIN zones z ON z.id = b.zone_id`;
  const params: string[] = [];
  const where: string[] = [];
  if (zone_id) { where.push("b.zone_id = ?"); params.push(zone_id as string); }
  if (category) { where.push("b.category = ?"); params.push(category as string); }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY z.name, b.name";
  res.json(await db.all<Building>(sql, params));
});

// GET /api/buildings/map - returns all buildings with coords for map rendering
// Registered before "/:id" so "map" isn't swallowed as an :id param.
router.get("/map", async (_req, res) => {
  res.json(await db.all<BuildingMapPoint>(`
    SELECT b.id, b.name, b.category, b.zone_id, b.total_sqft,
           b.daily_hours_l2, b.lat, b.lng,
           z.name as zone_name, z.color as zone_color
    FROM buildings b
    LEFT JOIN zones z ON z.id = b.zone_id
    WHERE b.lat IS NOT NULL
    ORDER BY z.name, b.name
  `));
});

router.get("/:id", async (req, res) => {
  const building = await db.get<BuildingDetail>(`SELECT b.*, z.name as zone_name, z.color as zone_color
    FROM buildings b LEFT JOIN zones z ON z.id = b.zone_id WHERE b.id = ?`, [req.params.id]);
  if (!building) return res.status(404).json({ error: "Not found" });
  building.spaces = await db.all(
    "SELECT * FROM building_spaces WHERE building_id = ? ORDER BY floor, space_type", [req.params.id]);
  res.json(building);
});

router.get("/:id/tasks", async (req, res) => {
  const { date } = req.query;
  const sql = `SELECT bt.*, tt.name as task_name, tt.priority, tt.is_disruptive,
    c.name as custodian_name FROM building_tasks bt
    JOIN task_types tt ON tt.id = bt.task_type_id
    LEFT JOIN custodians c ON c.id = bt.assigned_to
    WHERE bt.building_id = ? ${date ? "AND bt.schedule_date = ?" : ""}
    ORDER BY tt.priority`;
  const params = date ? [req.params.id, date as string] : [req.params.id];
  res.json(await db.all<BuildingTask>(sql, params));
});

router.patch("/:id", async (req, res) => {
  const parsed = buildingUpdateRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { zone_id, target_appa_level, notes, closed } = parsed.data;
  await db.run(`UPDATE buildings SET zone_id = COALESCE(?, zone_id),
    target_appa_level = COALESCE(?, target_appa_level),
    notes = COALESCE(?, notes), closed = COALESCE(?, closed) WHERE id = ?`,
    [zone_id ?? null, target_appa_level ?? null, notes ?? null, closed ?? null, req.params.id]);
  res.json({ ok: true });
});

export default router;
