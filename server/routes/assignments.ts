import { Router } from "express";
import db from "../db/index";
import { assignmentCreateRequestSchema } from "../../shared/schemas";
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
  const { custodian_id, building_id, assignment_type, days_of_week, notes } = parsed.data;
  const r = await db.run(
    `INSERT INTO custodian_assignments (custodian_id, building_id, assignment_type, days_of_week, notes)
     VALUES (?, ?, ?, ?, ?)`,
    [custodian_id, building_id, assignment_type, days_of_week ?? null, notes ?? null]);
  res.json({ id: Number(r.lastInsertRowid) });
});

router.delete("/:id", async (req, res) => {
  await db.run("DELETE FROM custodian_assignments WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

export default router;
