import { request } from "@/lib/api";

export interface UpdateJob {
  id: string;
  action: "check" | "install";
  status: "running" | "succeeded" | "failed" | "rolled_back" | "needs_attention";
  phase: string;
  message: string;
  started_at: string;
  finished_at?: string;
  requested_by: string;
}

export interface UpdateStatus {
  enabled: boolean;
  current_version: string;
  message?: string;
  available?: {
    version: string;
    digest: string;
    update_available: boolean;
    checked_at: string;
  } | null;
  job?: UpdateJob | null;
}

export function updateStatus(): Promise<UpdateStatus> {
  return request("/api/admin/update");
}

export function checkUpdate(): Promise<UpdateStatus> {
  return request("/api/admin/update/check", { method: "POST", body: "{}" });
}

export function installUpdate(digest: string): Promise<UpdateStatus> {
  return request("/api/admin/update/install", { method: "POST", body: JSON.stringify({ digest }) });
}
