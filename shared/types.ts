// Row shapes returned by the server's raw SQL queries (server/routes/*.ts).
// These describe trusted, internally-produced data - request bodies and AI
// output are validated separately with zod in shared/schemas.ts.

export interface Zone {
  id: number;
  name: string;
  color: string | null;
  description: string | null;
}

export interface ZoneWithBuildings extends Zone {
  buildings: BuildingSummary[];
  total_hours: number;
}

export interface BuildingSummary {
  id: number;
  name: string;
  category: string | null;
  total_sqft: number | null;
  daily_hours_l2: number | null;
}

export interface Building {
  id: number;
  name: string;
  category: string | null;
  zone_id: number | null;
  total_sqft: number | null;
  daily_hours_l1: number | null;
  daily_hours_l2: number | null;
  daily_hours_l3: number | null;
  target_appa_level: number | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  zone_name?: string | null;
  zone_color?: string | null;
}

export interface BuildingSpace {
  id: number;
  building_id: number;
  floor: string | null;
  space_type: string;
}

export interface BuildingDetail extends Building {
  spaces: BuildingSpace[];
}

export interface BuildingMapPoint {
  id: number;
  name: string;
  category: string | null;
  zone_id: number | null;
  total_sqft: number | null;
  daily_hours_l2: number | null;
  lat: number;
  lng: number;
  zone_name: string | null;
  zone_color: string | null;
}

export interface Custodian {
  id: number;
  name: string;
  shift_template_id: number | null;
  team_id: number | null;
  active: number;
  notes: string | null;
  shift_name?: string | null;
  start_time?: string | null;
  productive_min?: number | null;
}

export interface Team {
  id: number;
  name: string;
  notes: string | null;
}

export interface BuildingTask {
  id: number;
  building_id: number;
  task_type_id: number;
  estimated_hours: number;
  schedule_date: string;
  status: string;
  assigned_to: number | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  period: "morning" | "afternoon" | null;
  task_name?: string;
  priority?: number;
  is_disruptive?: number;
  building_name?: string;
  zone_id?: number | null;
  zone_name?: string | null;
  zone_color?: string | null;
  custodian_name?: string | null;
}

export interface Disruption {
  id: number;
  disruption_date: string;
  type: string;
  custodian_id: number | null;
  building_id: number | null;
  description: string | null;
  extra_hours: number;
  resolved: number;
  custodian_name?: string | null;
  building_name?: string | null;
}

export interface DailyCoverage {
  id: number;
  coverage_date: string;
  custodian_id: number;
  period: "morning" | "afternoon";
  assignment: string;
  excluded_note: string | null;
  custodian_name?: string;
}

export interface CustodianSchedule extends Custodian {
  tasks: BuildingTask[];
  assigned_hours: number;
}

export interface ZoneCoverage {
  zone: Zone;
  hours_needed: number;
  hours_assigned: number;
  gap: number;
}

export interface DailySchedule {
  date: string;
  custodians: CustodianSchedule[];
  tasks: BuildingTask[];
  disruptions: Disruption[];
  zone_coverage: ZoneCoverage[];
  unassigned_tasks: BuildingTask[];
}
