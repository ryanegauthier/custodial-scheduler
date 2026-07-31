import { Router } from "express";
import db from "../db/index";
import { dailyCoverageCreateRequestSchema } from "../../shared/schemas";
import type { DailyCoverage } from "../../shared/types";

const router = Router();

router.get("/", async (req, res) => {
  const { date } = req.query;
  const sql = `SELECT dc.*, c.name as custodian_name
    FROM daily_coverage dc JOIN custodians c ON c.id = dc.custodian_id
    ${date ? "WHERE dc.coverage_date = ?" : ""}
    ORDER BY dc.coverage_date DESC, dc.period, c.name`;
  res.json(await db.all<DailyCoverage>(sql, date ? [date as string] : []));
});

router.post("/", async (req, res) => {
  const parsed = dailyCoverageCreateRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { coverage_date, custodian_id, period, assignment, excluded_note } = parsed.data;
  const r = await db.run(`INSERT INTO daily_coverage
    (coverage_date, custodian_id, period, assignment, excluded_note)
    VALUES (?, ?, ?, ?, ?)`,
    [coverage_date, custodian_id, period, assignment, excluded_note ?? null]);
  res.json({ id: Number(r.lastInsertRowid) });
});

router.delete("/:id", async (req, res) => {
  await db.run("DELETE FROM daily_coverage WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

export default router;
