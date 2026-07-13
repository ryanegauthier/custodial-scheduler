import { z } from "zod";

// Validation for the two untrusted boundaries in this app: request bodies
// coming from the client, and JSON produced by the Claude model. Internal
// SQL row shapes (shared/types.ts) don't need runtime validation.

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

// --- Request bodies -------------------------------------------------------

export const generateScheduleRequestSchema = z.object({
  date: dateSchema,
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
  shift_template_id: z.number().optional(),
  active: z.number().optional(),
  notes: z.string().nullable().optional(),
});
export type CustodianUpdateRequest = z.infer<typeof custodianUpdateRequestSchema>;

export const buildingUpdateRequestSchema = z.object({
  zone_id: z.number().nullable().optional(),
  target_appa_level: z.number().nullable().optional(),
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
