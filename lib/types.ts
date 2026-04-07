import type { Session } from "next-auth";

export interface DashboardSession extends Session {
  user: Session["user"] & {
    id: string;
  };
}

export interface ActivityLogEntry {
  action: string;
  entity_type: string;
  entity_id?: string;
  details?: string;
  user_id: string;
  user_name: string;
  timestamp: Date;
}

export interface ErrorLogEntry {
  level: "error" | "warn" | "info";
  source: string;
  message: string;
  details?: unknown;
  timestamp: Date;
}
