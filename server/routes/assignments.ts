import { Router } from "express";
import db from "../db/index";
import { assignmentCreateRequestSchema, assignmentUpdateRequestSchema } from "../../shared/schemas";
import type { CustodianAssignment } from "../../shared/types";

const router = Router();

router.get("/", async (_req, res) => {
  res.json(await db.all<CustodianAssignment>(`
    SELECT ca.*, c.name as custodian_name, b.name as building_name
    FROM custodian_assignments ca
    JOIN custodians c ON c.id = ca.custodian_id
    JOIN buildings b ON b.id = ca.building_id
    ORDER BY c.name, ca.assignment_type, b.name
  `));
});

router.post("/", async (req, res) => {
  const parsed = assignmentCreateRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { custodian_id, building_id, assignment_type, days_of_week, notes, share_pct } = parsed.data;
  const r = await db.run(
    `INSERT INTO custodian_assignments (custodian_id, building_id, assignment_type, days_of_week, notes, share_pct)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [custodian_id, building_id, assignment_type, days_of_week ?? null, notes ?? null, share_pct]);
  res.json({ id: Number(r.lastInsertRowid) });
});

// share_pct and assignment_type are editable in place (other fields are
// still changed by removing and re-adding the assignment). Keeps notes,
// days and share when an assignment moves between primary and secondary.
router.patch("/:id", async (req, res) => {
  const parsed = assignmentUpdateRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { share_pct, assignment_type } = parsed.data;
  await db.run(`UPDATE custodian_assignments SET share_pct = COALESCE(?, share_pct),
    assignment_type = COALESCE(?, assignment_type) WHERE id = ?`,
    [share_pct ?? null, assignment_type ?? null, req.params.id]);
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  await db.run("DELETE FROM custodian_assignments WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

export default router;
