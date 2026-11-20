import { Router } from "express";
import db from "../db/index";
import {
  custodianBackRequestSchema,
  custodianCreateRequestSchema,
  custodianStatusCreateRequestSchema,
  custodianUpdateRequestSchema,
} from "../../shared/schemas";
import type { Custodian, CustodianStatus } from "../../shared/types";

const router = Router();

// Which of several status rows covering the same date wins: a dated row
// over an open-start one, then the latest start, then (same start date)
// the newest record. Same order as unavailableCustodianMap in
// server/routes/schedules.ts - keep the two in sync.
function byPrecedence(a: CustodianStatus, b: CustodianStatus): number {
  if (!a.effective_date && b.effective_date) return 1;
  if (a.effective_date && !b.effective_date) return -1;
  return (b.effective_date ?? "").localeCompare(a.effective_date ?? "") || b.id - a.id;
}

function previousDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Each custodian's status for `date` (default today): current_status is
// the winning absence covering that date (null when the winner is an
// 'active' row or nothing covers it), upcoming_status the soonest absence
// starting after it. Drives the Custodians page's Today badge.
router.get("/", async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const custodians = await db.all<Custodian>(`SELECT c.*, s.name as shift_name, s.start_time, s.productive_min
    FROM custodians c LEFT JOIN shift_templates s ON s.id = c.shift_template_id
    WHERE c.active = 1 ORDER BY s.start_time, c.name`);
  const rows = await db.all<CustodianStatus>(
    `SELECT * FROM custodian_status WHERE end_date IS NULL OR end_date >= ?`, [date]);

  const byCustodian = new Map<number, CustodianStatus[]>();
  for (const r of rows) {
    const list = byCustodian.get(r.custodian_id) ?? [];
    list.push(r);
    byCustodian.set(r.custodian_id, list);
  }

  for (const c of custodians) {
    const list = byCustodian.get(c.id) ?? [];
    const current = list.filter(r => !r.effective_date || r.effective_date <= date).sort(byPrecedence)[0];
    c.current_status = current && current.status !== "active" ? current : null;
    c.upcoming_status = list
      .filter(r => r.status !== "active" && r.effective_date && r.effective_date > date)
      .sort((a, b) => a.effective_date!.localeCompare(b.effective_date!))[0] ?? null;
  }
  res.json(custodians);
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
  const { name, active, notes, coverage_approved } = parsed.data;
  await db.run(`UPDATE custodians SET name = COALESCE(?, name),
    active = COALESCE(?, active), notes = COALESCE(?, notes),
    coverage_approved = COALESCE(?, coverage_approved) WHERE id = ?`,
    [name ?? null, active ?? null, notes ?? null, coverage_approved ?? null, req.params.id]);

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

  rows.sort(byPrecedence);

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

// "Back" as of `date`: ends every absence (callout/fmla/vacation) that
// covers that date. A row starting on/after `date` is deleted (it never
// really happened); one that started earlier, or has no start, gets its
// end_date set to the day before, so the history of the absence is kept.
// Absences starting later (e.g. a vacation next month) are untouched.
// Preferred over inserting an 'active' row: it leaves nothing for status
// precedence to get wrong.
router.post("/:id/back", async (req, res) => {
  const parsed = custodianBackRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { date } = parsed.data;
  const covering = await db.all<CustodianStatus>(
    `SELECT * FROM custodian_status WHERE custodian_id = ? AND status <> 'active'
       AND (effective_date IS NULL OR effective_date <= ?)
       AND (end_date IS NULL OR end_date >= ?)`,
    [req.params.id, date, date]);
  for (const r of covering) {
    if (r.effective_date && r.effective_date >= date) {
      await db.run("DELETE FROM custodian_status WHERE id = ?", [r.id]);
    } else {
      await db.run("UPDATE custodian_status SET end_date = ? WHERE id = ?", [previousDay(date), r.id]);
    }
  }
  res.json({ ok: true, ended: covering.length });
});

// Deletes one status row outright. No longer used by the Custodians page
// (it uses POST /:id/back), kept as a plain API for correcting a mistaken
// entry.
router.delete("/:id/status/:statusId", async (req, res) => {
  await db.run("DELETE FROM custodian_status WHERE id = ? AND custodian_id = ?",
    [req.params.statusId, req.params.id]);
  res.json({ ok: true });
});

export default router;
