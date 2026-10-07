import { Router } from "express";
import db from "../db/index";
import {
  custodianCreateRequestSchema,
  custodianStatusCreateRequestSchema,
  custodianUpdateRequestSchema,
} from "../../shared/schemas";
import type { Custodian, CustodianStatus } from "../../shared/types";

const router = Router();

router.get("/", async (_req, res) => {
  res.json(await db.all<Custodian>(`SELECT c.*, s.name as shift_name, s.start_time, s.productive_min
    FROM custodians c LEFT JOIN shift_templates s ON s.id = c.shift_template_id
    WHERE c.active = 1 ORDER BY s.start_time, c.name`));
});

router.get("/:id", async (req, res) => {
  const c = await db.get<Custodian>(`SELECT c.*, s.name as shift_name, s.start_time, s.productive_min
    FROM custodians c LEFT JOIN shift_templates s ON s.id = c.shift_template_id
    WHERE c.id = ?`, [req.params.id]);
  if (!c) return res.status(404).json({ error: "Not found" });
  res.json(c);
});

router.post("/", async (req, res) => {
  const parsed = custodianCreateRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, shift_template_id, notes } = parsed.data;
  const r = await db.run(
    "INSERT INTO custodians (name, shift_template_id, notes) VALUES (?, ?, ?)",
    [name, shift_template_id, notes ?? null]);
  res.json({ id: Number(r.lastInsertRowid) });
});

router.patch("/:id", async (req, res) => {
  const parsed = custodianUpdateRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, active, notes } = parsed.data;
  await db.run(`UPDATE custodians SET name = COALESCE(?, name),
    active = COALESCE(?, active), notes = COALESCE(?, notes) WHERE id = ?`,
    [name ?? null, active ?? null, notes ?? null, req.params.id]);

  // shift_template_id needs to support being explicitly cleared back to
  // null (e.g. dragging a custodian back to "Unassigned"), which the
  // COALESCE pattern above can't express - a null param there just keeps
  // whatever value was already there instead of clearing it.
  if ("shift_template_id" in req.body) {
    await db.run("UPDATE custodians SET shift_template_id = ? WHERE id = ?",
      [parsed.data.shift_template_id ?? null, req.params.id]);
  }
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  await db.run("UPDATE custodians SET active = 0 WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

// Current status as of a date (default: today) - the most specific row
// (non-null effective_date, then latest-starting) whose [effective_date,
// end_date] window covers it; no covering row means active. Mirrors the
// resolution logic in server/routes/schedules.ts.
router.get("/:id/status", async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const rows = await db.all<CustodianStatus>(
    `SELECT * FROM custodian_status WHERE custodian_id = ?
       AND (effective_date IS NULL OR effective_date <= ?)
       AND (end_date IS NULL OR end_date >= ?)`,
    [req.params.id, date, date]);

  rows.sort((a, b) => {
    if (!a.effective_date && b.effective_date) return 1;
    if (a.effective_date && !b.effective_date) return -1;
    return (b.effective_date ?? "").localeCompare(a.effective_date ?? "");
  });

  res.json({ date, status: rows[0]?.status ?? "active", record: rows[0] ?? null });
});

router.post("/:id/status", async (req, res) => {
  const parsed = custodianStatusCreateRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { status, effective_date, end_date, notes } = parsed.data;
  const r = await db.run(
    `INSERT INTO custodian_status (custodian_id, status, effective_date, end_date, notes)
     VALUES (?, ?, ?, ?, ?)`,
    [req.params.id, status, effective_date ?? null, end_date ?? null, notes ?? null]);
  res.json({ id: Number(r.lastInsertRowid) });
});

export default router;
