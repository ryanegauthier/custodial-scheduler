import { Router } from "express";
import db from "../db/index.js";

const router = Router();

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

async function callClaude(systemPrompt, userPrompt) {
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

// POST /api/ai/rebalance
// Given a date and list of disruptions, return a rebalanced plan
router.post("/rebalance", async (req, res) => {
  const { date } = req.body;
  if (!date) return res.status(400).json({ error: "date required" });

  // Gather full context
  const custodians = db.prepare(`
    SELECT c.id, c.name, s.start_time, s.productive_min
    FROM custodians c
    JOIN shift_templates s ON s.id = c.shift_template_id
    WHERE c.active = 1 ORDER BY s.start_time
  `).all();

  const disruptions = db.prepare(`
    SELECT d.*, c.name as custodian_name, b.name as building_name
    FROM disruptions d
    LEFT JOIN custodians c ON c.id = d.custodian_id
    LEFT JOIN buildings b ON b.id = d.building_id
    WHERE d.disruption_date = ? AND d.resolved = 0
  `).all(date);

  const tasks = db.prepare(`
    SELECT bt.id, bt.estimated_hours, bt.assigned_to, bt.status,
           tt.name as task_name, tt.priority, tt.is_disruptive,
           b.name as building_name, b.zone_id,
           z.name as zone_name
    FROM building_tasks bt
    JOIN task_types tt ON tt.id = bt.task_type_id
    JOIN buildings b ON b.id = bt.building_id
    LEFT JOIN zones z ON z.id = b.zone_id
    WHERE bt.schedule_date = ?
    ORDER BY z.name, b.name, tt.priority
  `).all(date);

  const system = `You are a custodial scheduling assistant for Whitworth University.
You help supervisors rebalance daily cleaning assignments when disruptions occur.
Shift structure: 4am, 5am, or 6am start, 7.5 hours total, 7 productive hours.
Task priority order: Floors/Vacuum first (most disruptive, before occupants arrive), then Restrooms, Trash (Classrooms), Trash (Common), Spot Clean last.
Always respond in JSON only. No preamble, no markdown fences.`;

  const user = `Date: ${date}
Custodians: ${JSON.stringify(custodians)}
Disruptions today: ${JSON.stringify(disruptions)}
Current task assignments: ${JSON.stringify(tasks)}

Produce a rebalanced schedule. Return JSON with this shape:
{
  "summary": "plain English explanation of what changed and why",
  "warnings": ["any coverage gaps or issues to flag"],
  "reassignments": [
    {
      "task_id": number,
      "new_custodian_id": number,
      "reason": "brief explanation"
    }
  ]
}`;

  try {
    const raw = await callClaude(system, user);
    const parsed = JSON.parse(raw);
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: "AI error", detail: err.message });
  }
});

// POST /api/ai/suggest-zones
// Ask AI to suggest zone assignments for buildings based on geography
router.post("/suggest-zones", async (req, res) => {
  const buildings = db.prepare(
    "SELECT id, name, category, total_sqft, daily_hours_l2, zone_id, lat, lng FROM buildings ORDER BY name"
  ).all();
  const zones = db.prepare("SELECT * FROM zones").all();

  const system = `You are a Whitworth University campus facilities expert. 
Respond in JSON only. No preamble, no markdown fences.`;

  const user = `Given these campus zones: ${JSON.stringify(zones)}
And these buildings: ${JSON.stringify(buildings)}
Suggest the best zone assignment for each building based on campus geography and operational logic.
Return JSON: { "assignments": [{ "building_id": number, "zone_id": number, "reason": "brief" }] }`;

  try {
    const raw = await callClaude(system, user);
    res.json(JSON.parse(raw));
  } catch (err) {
    res.status(500).json({ error: "AI error", detail: err.message });
  }
});

// POST /api/ai/callout-impact
// Quick plain-English summary of callout impact
router.post("/callout-impact", async (req, res) => {
  const { custodian_id, date } = req.body;

  const custodian = db.prepare(
    "SELECT c.*, s.start_time FROM custodians c JOIN shift_templates s ON s.id = c.shift_template_id WHERE c.id = ?"
  ).get(custodian_id);

  const tasks = db.prepare(`
    SELECT bt.estimated_hours, tt.name as task_name, b.name as building_name, z.name as zone_name
    FROM building_tasks bt
    JOIN task_types tt ON tt.id = bt.task_type_id
    JOIN buildings b ON b.id = bt.building_id
    LEFT JOIN zones z ON z.id = b.zone_id
    WHERE bt.assigned_to = ? AND bt.schedule_date = ?
  `).all(custodian_id, date);

  const availableCustodians = db.prepare(`
    SELECT c.id, c.name, s.start_time, s.productive_min,
           COALESCE(SUM(bt.estimated_hours), 0) as assigned_hours
    FROM custodians c
    JOIN shift_templates s ON s.id = c.shift_template_id
    LEFT JOIN building_tasks bt ON bt.assigned_to = c.id AND bt.schedule_date = ?
    WHERE c.active = 1 AND c.id != ?
    GROUP BY c.id
    ORDER BY assigned_hours ASC
  `).all(date, custodian_id);

  const system = `You are a custodial scheduling assistant. Be concise and practical. Plain English only, no JSON.`;
  const user = `${custodian?.name} (${custodian?.start_time} shift) has called out for ${date}.
Their tasks: ${JSON.stringify(tasks)}
Available staff and current load: ${JSON.stringify(availableCustodians)}
In 3-4 sentences, explain the impact and suggest the most practical coverage solution.`;

  try {
    const text = await callClaude(system, user);
    res.json({ summary: text });
  } catch (err) {
    res.status(500).json({ error: "AI error", detail: err.message });
  }
});

export default router;
