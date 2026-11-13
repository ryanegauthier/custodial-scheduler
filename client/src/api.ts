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
  BuildingUpdateRequest,
  CustodianCreateRequest,
  CustodianStatusCreateRequest,
  CustodianUpdateRequest,
} from "@shared/schemas";

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  return res.json() as Promise<T>;
}

async function postJSON<T>(url: string, body: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as T };
}

async function patchJSON<T>(url: string, body: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as T };
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
  deactivateCustodian: (id: number) =>
    fetch(`/api/custodians/${id}`, { method: "DELETE" }).then(r => r.json() as Promise<{ ok: true }>),
  updateCustodian: (id: number, body: CustodianUpdateRequest) =>
    patchJSON<{ ok: true }>(`/api/custodians/${id}`, body),

  getSchedule: (date: string) => getJSON<DailySchedule>(`/api/schedules?date=${date}`),
  generateSchedule: (date: string, force = false) =>
    postJSON<{ ok: true; date: string; tasks_created: number } | { error: string; count: number }>(
      "/api/schedules/generate",
      { date, force },
    ),

  getAssignments: () => getJSON<CustodianAssignment[]>("/api/assignments"),
  addAssignment: (body: AssignmentCreateRequest) =>
    postJSON<{ id: number }>("/api/assignments", body),
  deleteAssignment: (id: number) =>
    fetch(`/api/assignments/${id}`, { method: "DELETE" }).then(r => r.json() as Promise<{ ok: true }>),

  getCustodianStatus: (id: number, date?: string) =>
    getJSON<{ date: string; status: string; record: CustodianStatus | null }>(
      `/api/custodians/${id}/status${date ? `?date=${date}` : ""}`,
    ),
  setCustodianStatus: (id: number, body: CustodianStatusCreateRequest) =>
    postJSON<{ id: number }>(`/api/custodians/${id}/status`, body),
  deleteCustodianStatus: (id: number, statusId: number) =>
    fetch(`/api/custodians/${id}/status/${statusId}`, { method: "DELETE" })
      .then(r => r.json() as Promise<{ ok: true }>),

  aiRebalance: (date: string) => postJSON<AIRebalanceResult>("/api/ai/rebalance", { date }),
  aiSuggestZones: () => postJSON<AISuggestZonesResult>("/api/ai/suggest-zones", {}),
};
