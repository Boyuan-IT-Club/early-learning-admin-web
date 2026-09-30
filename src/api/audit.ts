import { get } from "./client";

/** 管控审计接口：只读。 */

export interface AuditLog {
  id: number;
  actor_type: "ADMIN" | "TEACHER" | "SYSTEM";
  actor_id: number | null;
  action: string;
  target_type: "ADMIN" | "TEACHER" | "LICENSE" | null;
  target_id: string | null;
  reason: string | null;
  /** 非敏感补充信息的 JSON 字符串。 */
  detail: string | null;
  result: "SUCCESS" | "FAILED";
  ip: string | null;
  trace_id: string | null;
  created_at: string;
}

export interface AuditPage {
  items: AuditLog[];
  page: number;
  page_size: number;
  total: number;
}

export interface ListAuditQuery {
  page?: number;
  page_size?: number;
  action?: string;
  target_type?: string;
  target_id?: string;
}

export function listAuditLogs(query: ListAuditQuery = {}): Promise<AuditPage> {
  return get<AuditPage>("/admin/audit-logs", { params: query });
}
