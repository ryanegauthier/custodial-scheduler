import { Router } from "express";
import db from "../db/index.js";

const router = Router();

router.get("/", async (req, res) => {
  res.json(await db.all(`SELECT c.*, s.name as shift_name, s.start_time, s.productive_min
    FROM custodians c LEFT JOIN shift_templates s ON s.id = c.shift_template_id
    WHERE c.active = 1 ORDER BY s.start_time, c.name`));
});

router.get("/:id", async (req, res) => {
  const c = await db.get(`SELECT c.*, s.name as shift_name, s.start_time, s.productive_min
    FROM custodians c LEFT JOIN shift_templates s ON s.id = c.shift_template_id
    WHERE c.id = ?`, [req.params.id]);
  if (!c) return res.status(404).json({ error: "Not found" });
  res.json(c);
});

router.post("/", async (req, res) => {
  const { name, shift_template_id, notes } = req.body;
  const r = await db.run(
    "INSERT INTO custodians (name, shift_template_id, notes) VALUES (?, ?, ?)",
    [name, shift_template_id, notes]);
  res.json({ id: r.lastInsertRowid });
});

router.patch("/:id", async (req, res) => {
  const { name, shift_template_id, active, notes } = req.body;
  await db.run(`UPDATE custodians SET name = COALESCE(?, name),
    shift_template_id = COALESCE(?, shift_template_id),
    active = COALESCE(?, active), notes = COALESCE(?, notes) WHERE id = ?`,
    [name, shift_template_id, active, notes, req.params.id]);
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  await db.run("UPDATE custodians SET active = 0 WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

export default router;
