import { get, post } from "./client";

/**
 * 教师账号接口。教师资料（姓名等）只存在平板上，后台只有用户名、状态、激活码与设备绑定信息。
 */

export type TeacherStatus = "ACTIVE" | "DISABLED";

export interface Teacher {
  id: number;
  username: string;
  status: TeacherStatus;
  license: {
    id: number;
    code_hint: string;
    status: "UNUSED" | "ACTIVE" | "REVOKED";
    remark: string | null;
  } | null;
  device_bound: boolean;
  device_bound_at: string | null;
  last_refresh_at: string | null;
  created_at: string;
  /** 只有详情接口返回。 */
  disabled_reason?: string | null;
}

export interface TeacherPage {
  items: Teacher[];
  page: number;
  page_size: number;
  total: number;
}

export interface RecoveryCode {
  /** 明文，格式 XXXX-XXXX，24 小时有效、一次性；关闭后无法再次查看。 */
  recovery_code: string;
  expires_at: string;
}

export interface ListTeachersQuery {
  page?: number;
  page_size?: number;
  status?: TeacherStatus;
  keyword?: string;
}

export function listTeachers(query: ListTeachersQuery = {}): Promise<TeacherPage> {
  return get<TeacherPage>("/admin/teachers", { params: query });
}

export function getTeacher(id: number): Promise<Teacher> {
  return get<Teacher>(`/admin/teachers/${id}`);
}

/** 停用：立即生效，平板进入受限模式；可再启用。原因必填。 */
export function disableTeacher(id: number, reason: string): Promise<null> {
  return post<null>(`/admin/teachers/${id}/disable`, { reason });
}

export function enableTeacher(id: number): Promise<null> {
  return post<null>(`/admin/teachers/${id}/enable`);
}

/** 解绑设备：原设备从此无法访问云端，数据需离线备份恢复。原因必填。 */
export function unbindTeacherDevice(id: number, reason: string): Promise<null> {
  return post<null>(`/admin/teachers/${id}/unbind-device`, { reason });
}

/** 签发恢复码：覆盖旧码。重试沿用同一个 `idempotencyKey`，10 分钟内返回同一枚码。 */
export function issueRecoveryCode(id: number, idempotencyKey: string): Promise<RecoveryCode> {
  return post<RecoveryCode>(`/admin/teachers/${id}/recovery-code`, undefined, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
}
