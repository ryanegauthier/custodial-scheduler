import { Router } from "express";
import db from "../db/index.js";

const router = Router();

router.get("/", async (req, res) => {
  const { date } = req.query;
  const sql = `SELECT d.*, c.name as custodian_name, b.name as building_name
    FROM disruptions d LEFT JOIN custodians c ON c.id = d.custodian_id
    LEFT JOIN buildings b ON b.id = d.building_id
    ${date ? "WHERE d.disruption_date = ?" : ""}
    ORDER BY d.disruption_date DESC, d.type`;
  res.json(await db.all(sql, date ? [date] : []));
});

router.post("/", async (req, res) => {
  const { disruption_date, type, custodian_id, building_id, description, extra_hours } = req.body;
  const r = await db.run(`INSERT INTO disruptions
    (disruption_date, type, custodian_id, building_id, description, extra_hours)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [disruption_date, type, custodian_id, building_id, description, extra_hours || 0]);
  res.json({ id: r.lastInsertRowid });
});

router.patch("/:id/resolve", async (req, res) => {
  await db.run("UPDATE disruptions SET resolved = 1 WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  await db.run("DELETE FROM disruptions WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

export default router;
