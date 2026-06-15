import { Router } from "express";
import db from "../db/index.js";

const router = Router();

router.get("/", async (req, res) => {
  const zones = await db.all("SELECT * FROM zones ORDER BY name");
  for (const z of zones) {
    z.buildings = await db.all(
      "SELECT id, name, category, total_sqft, daily_hours_l2 FROM buildings WHERE zone_id = ? ORDER BY name",
      [z.id]);
    z.total_hours = z.buildings.reduce((s, b) => s + (b.daily_hours_l2 || 0), 0);
  }
  res.json(zones);
});

router.get("/:id", async (req, res) => {
  const zone = await db.get("SELECT * FROM zones WHERE id = ?", [req.params.id]);
  if (!zone) return res.status(404).json({ error: "Not found" });
  zone.buildings = await db.all("SELECT * FROM buildings WHERE zone_id = ? ORDER BY name", [req.params.id]);
  res.json(zone);
});

router.patch("/:id", async (req, res) => {
  const { name, color, description } = req.body;
  await db.run(`UPDATE zones SET name = COALESCE(?, name), color = COALESCE(?, color),
    description = COALESCE(?, description) WHERE id = ?`,
    [name, color, description, req.params.id]);
  res.json({ ok: true });
});

export default router;
