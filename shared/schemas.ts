import { z } from "zod";

// Validation for the two untrusted boundaries in this app: request bodies
// coming from the client, and JSON produced by the Claude model. Internal
// SQL row shapes (shared/types.ts) don't need runtime validation.

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

// --- Request bodies -------------------------------------------------------

export const generateScheduleRequestSchema = z.object({
  date: dateSchema,
  force: z.boolean().optional(),
});
export type GenerateScheduleRequest = z.infer<typeof generateScheduleRequestSchema>;

export const assignTaskRequestSchema = z.object({
  task_id: z.number(),
  custodian_id: z.number(),
  scheduled_start: z.string().nullable().optional(),
  scheduled_end: z.string().nullable().optional(),
});
export type AssignTaskRequest = z.infer<typeof assignTaskRequestSchema>;

export const unassignTaskRequestSchema = z.object({
  task_id: z.number(),
});
export type UnassignTaskRequest = z.infer<typeof unassignTaskRequestSchema>;

export const taskStatusRequestSchema = z.object({
  status: z.string(),
});
export type TaskStatusRequest = z.infer<typeof taskStatusRequestSchema>;

export const custodianCreateRequestSchema = z.object({
  name: z.string().min(1),
  shift_template_id: z.number(),
  notes: z.string().nullable().optional(),
});
export type CustodianCreateRequest = z.infer<typeof custodianCreateRequestSchema>;

export const custodianUpdateRequestSchema = z.object({
  name: z.string().min(1).optional(),
  shift_template_id: z.number().nullable().optional(),
  active: z.number().optional(),
  notes: z.string().nullable().optional(),
  coverage_approved: z.union([z.literal(0), z.literal(1)]).optional(),
});
export type CustodianUpdateRequest = z.infer<typeof custodianUpdateRequestSchema>;

export const assignmentCreateRequestSchema = z.object({
  custodian_id: z.number(),
  building_id: z.number(),
  assignment_type: z.enum(["primary", "secondary"]).default("primary"),
  days_of_week: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  share_pct: z.number().int().min(1).max(100).default(100),
});

// In-place edits: share_pct (share editor) and assignment_type (dragging
// a chip between Building Coverage and Additional Coverage). At least one.
export const assignmentUpdateRequestSchema = z.object({
  share_pct: z.number().int().min(1).max(100).optional(),
  assignment_type: z.enum(["primary", "secondary"]).optional(),
}).refine(b => b.share_pct !== undefined || b.assignment_type !== undefined, {
  message: "expected share_pct or assignment_type",
});
export type AssignmentUpdateRequest = z.infer<typeof assignmentUpdateRequestSchema>;
export type AssignmentCreateRequest = z.infer<typeof assignmentCreateRequestSchema>;

export const custodianStatusCreateRequestSchema = z.object({
  status: z.enum(["active", "fmla", "callout", "vacation"]),
  effective_date: dateSchema.nullable().optional(),
  end_date: dateSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
}).refine(
  s => !s.effective_date || !s.end_date || s.end_date >= s.effective_date,
  { message: "end_date must be on or after effective_date", path: ["end_date"] },
);

// "Back" from any absence in effect on `date` (see POST /:id/back).
export const custodianBackRequestSchema = z.object({ date: dateSchema });
export type CustodianStatusCreateRequest = z.infer<typeof custodianStatusCreateRequestSchema>;

export const buildingUpdateRequestSchema = z.object({
  zone_id: z.number().nullable().optional(),
  // Only L1-L3 have an hours column on buildings (daily_hours_l1/l2/l3) -
  // an L4/L5 value would silently have nothing for schedule generation to
  // read.
  target_appa_level: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type BuildingUpdateRequest = z.infer<typeof buildingUpdateRequestSchema>;

export const zoneUpdateRequestSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  description: z.string().nullable().optional(),
});
export type ZoneUpdateRequest = z.infer<typeof zoneUpdateRequestSchema>;

export const disruptionCreateRequestSchema = z.object({
  disruption_date: dateSchema,
  type: z.string().min(1),
  custodian_id: z.number().nullable().optional(),
  building_id: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
  extra_hours: z.number().optional(),
});
export type DisruptionCreateRequest = z.infer<typeof disruptionCreateRequestSchema>;

export const dailyCoverageCreateRequestSchema = z.object({
  coverage_date: dateSchema,
  custodian_id: z.number(),
  period: z.enum(["morning", "afternoon"]),
  assignment: z.string().min(1),
  excluded_note: z.string().nullable().optional(),
});
export type DailyCoverageCreateRequest = z.infer<typeof dailyCoverageCreateRequestSchema>;

export const aiRebalanceRequestSchema = z.object({
  date: dateSchema,
});
export type AIRebalanceRequest = z.infer<typeof aiRebalanceRequestSchema>;

export const aiCalloutImpactRequestSchema = z.object({
  custodian_id: z.number(),
  date: dateSchema,
});
export type AICalloutImpactRequest = z.infer<typeof aiCalloutImpactRequestSchema>;

// --- Claude JSON responses --------------------------------------------------
// callClaude() returns raw text; these validate the parsed JSON before the
// server trusts it enough to forward to the client.

export const aiRebalanceResultSchema = z.object({
  summary: z.string(),
  warnings: z.array(z.string()).default([]),
  reassignments: z
    .array(
      z.object({
        task_id: z.number(),
        new_custodian_id: z.number(),
        reason: z.string(),
      }),
    )
    .default([]),
});
export type AIRebalanceResult = z.infer<typeof aiRebalanceResultSchema>;

export const aiSuggestZonesResultSchema = z.object({
  assignments: z.array(
    z.object({
      building_id: z.number(),
      zone_id: z.number(),
      reason: z.string(),
    }),
  ),
});
export type AISuggestZonesResult = z.infer<typeof aiSuggestZonesResultSchema>;
