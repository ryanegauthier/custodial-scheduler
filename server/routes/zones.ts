import { Router } from "express";
import db from "../db/index";
import { zoneUpdateRequestSchema } from "../../shared/schemas";
import type { Building, BuildingSummary, Zone, ZoneWithBuildings } from "../../shared/types";

const router = Router();

router.get("/", async (_req, res) => {
  const zones = await db.all<Zone>("SELECT * FROM zones ORDER BY name");
  const withBuildings: ZoneWithBuildings[] = [];
  for (const z of zones) {
    const buildings = await db.all<BuildingSummary>(
      "SELECT id, name, category, total_sqft, daily_hours_l2 FROM buildings WHERE zone_id = ? ORDER BY name",
      [z.id]);
    const total_hours = buildings.reduce((s, b) => s + (b.daily_hours_l2 || 0), 0);
    withBuildings.push({ ...z, buildings, total_hours });
  }
  res.json(withBuildings);
});

router.get("/:id", async (req, res) => {
  const zone = await db.get<Zone>("SELECT * FROM zones WHERE id = ?", [req.params.id]);
  if (!zone) return res.status(404).json({ error: "Not found" });
  const buildings = await db.all<Building>("SELECT * FROM buildings WHERE zone_id = ? ORDER BY name", [req.params.id]);
  res.json({ ...zone, buildings });
});

router.patch("/:id", async (req, res) => {
  const parsed = zoneUpdateRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, color, description } = parsed.data;
  await db.run(`UPDATE zones SET name = COALESCE(?, name), color = COALESCE(?, color),
    description = COALESCE(?, description) WHERE id = ?`,
    [name ?? null, color ?? null, description ?? null, req.params.id]);
  res.json({ ok: true });
});

export default router;
