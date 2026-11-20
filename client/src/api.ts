import type {
  Building,
  BuildingMapPoint,
  Custodian,
  CustodianAssignment,
  CustodianStatus,
  DailySchedule,
  ZoneWithBuildings,
} from "@shared/types";
import type {
  AIRebalanceResult,
  AISuggestZonesResult,
  AssignmentCreateRequest,
  AssignmentUpdateRequest,
  BuildingUpdateRequest,
  CustodianCreateRequest,
  CustodianStatusCreateRequest,
  CustodianUpdateRequest,
} from "@shared/schemas";

// Thrown by every api.* call when a request fails (non-2xx, or the server
// is unreachable - status 0). App.tsx shows any uncaught ApiError as a
// toast, so pages only need to catch one when they want to handle a
// specific status themselves (e.g. ScheduleBoard's 409).
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

// Server errors are { error: string } (server/app.ts's error handler and
// most routes), except zod validation failures, where `error` is
// zod's flatten() output: { formErrors: string[], fieldErrors: { [field]: string[] } }.
function errorMessage(body: unknown, res: Response): string {
  const err = (body as { error?: unknown } | null)?.error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const { formErrors = [], fieldErrors = {} } = err as {
      formErrors?: string[]; fieldErrors?: Record<string, string[] | undefined>;
    };
    const parts = [
      ...formErrors,
      ...Object.entries(fieldErrors).map(([field, msgs]) => `${field}: ${(msgs ?? []).join(", ")}`),
    ];
    if (parts.length) return `Invalid request - ${parts.join("; ")}`;
  }
  // Our API always answers in JSON, so a non-JSON 5xx almost always means
  // the Vite dev proxy couldn't reach it.
  if (res.status >= 500) return `Server error (${res.status}) - is the API server running?`;
  return `Request failed (${res.status}${res.statusText ? ` ${res.statusText}` : ""})`;
}

async function request<T>(url: string, init?: RequestInit): Promise<{ status: number; data: T }> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError("Could not reach the server.", 0);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON body (e.g. a proxy error page) - errorMessage handles null
  }
  if (!res.ok) throw new ApiError(errorMessage(body, res), res.status);
  return { status: res.status, data: body as T };
}

async function getJSON<T>(url: string): Promise<T> {
  return (await request<T>(url)).data;
}

function sendJSON<T>(method: "POST" | "PATCH", url: string, body: unknown) {
  return request<T>(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const postJSON = <T>(url: string, body: unknown) => sendJSON<T>("POST", url, body);
const patchJSON = <T>(url: string, body: unknown) => sendJSON<T>("PATCH", url, body);

async function deleteJSON<T>(url: string): Promise<T> {
  return (await request<T>(url, { method: "DELETE" })).data;
}

export const api = {
  getBuildings: () => getJSON<Building[]>("/api/buildings"),
  getBuildingsMap: () => getJSON<BuildingMapPoint[]>("/api/buildings/map"),
  updateBuilding: (id: number, body: BuildingUpdateRequest) =>
    patchJSON<{ ok: true }>(`/api/buildings/${id}`, body),
  getZones: () => getJSON<ZoneWithBuildings[]>("/api/zones"),

  getCustodians: (date?: string) =>
    getJSON<Custodian[]>(`/api/custodians${date ? `?date=${date}` : ""}`),
  addCustodian: (body: CustodianCreateRequest) =>
    postJSON<{ id: number }>("/api/custodians", body),
  deactivateCustodian: (id: number) => deleteJSON<{ ok: true }>(`/api/custodians/${id}`),
  updateCustodian: (id: number, body: CustodianUpdateRequest) =>
    patchJSON<{ ok: true }>(`/api/custodians/${id}`, body),

  getSchedule: (date: string) => getJSON<DailySchedule>(`/api/schedules?date=${date}`),
  generateSchedule: (date: string, force = false) =>
    // 409 (schedule already exists, force not set) throws an ApiError.
    postJSON<{ ok: true; date: string; tasks_created: number }>(
      "/api/schedules/generate",
      { date, force },
    ),

  getAssignments: () => getJSON<CustodianAssignment[]>("/api/assignments"),
  addAssignment: (body: AssignmentCreateRequest) =>
    postJSON<{ id: number }>("/api/assignments", body),
  updateAssignment: (id: number, body: AssignmentUpdateRequest) =>
    patchJSON<{ ok: true }>(`/api/assignments/${id}`, body),
  deleteAssignment: (id: number) => deleteJSON<{ ok: true }>(`/api/assignments/${id}`),

  getCustodianStatus: (id: number, date?: string) =>
    getJSON<{ date: string; status: string; record: CustodianStatus | null }>(
      `/api/custodians/${id}/status${date ? `?date=${date}` : ""}`,
    ),
  setCustodianStatus: (id: number, body: CustodianStatusCreateRequest) =>
    postJSON<{ id: number }>(`/api/custodians/${id}/status`, body),
  // Ends every absence covering `date` (see POST /api/custodians/:id/back).
  markCustodianBack: (id: number, date: string) =>
    postJSON<{ ok: true; ended: number }>(`/api/custodians/${id}/back`, { date }),
  deleteCustodianStatus: (id: number, statusId: number) =>
    deleteJSON<{ ok: true }>(`/api/custodians/${id}/status/${statusId}`),

  aiRebalance: (date: string) => postJSON<AIRebalanceResult>("/api/ai/rebalance", { date }),
  aiSuggestZones: () => postJSON<AISuggestZonesResult>("/api/ai/suggest-zones", {}),
};
