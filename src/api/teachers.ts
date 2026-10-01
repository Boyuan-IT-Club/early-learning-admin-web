import { get, patch } from "./client";

/**
 * 教师云端账号（契约 listTeachers / updateTeacherStatus）。
 * 云端只有用户名与状态；教师密码与资料都在平板本地，停用不影响平板本地登录。
 */

/** 契约 `UserStatus`：0 停用，1 启用。 */
export type TeacherStatus = 0 | 1;

/** 契约 `UserAccount`。 */
export interface Teacher {
  id: number;
  username: string;
  status: TeacherStatus;
  created_at: string;
}

export interface TeacherPage {
  items: Teacher[];
  page: number;
  page_size: number;
  total: number;
}

export interface ListTeachersQuery {
  page?: number;
  page_size?: number;
  /** 服务端转小写后包含匹配，% 与 _ 按普通字符处理。 */
  username?: string;
  status?: TeacherStatus;
}

export function listTeachers(query: ListTeachersQuery = {}): Promise<TeacherPage> {
  return get<TeacherPage>("/admin/users", { params: query });
}

/**
 * 停用或启用。启用要求绑定的激活码仍为 ACTIVE，否则 409 LICENSE_REVOKED。
 * 停用不吊销 Token：重新启用后，教师未过期的凭证恢复可用。
 */
export function updateTeacherStatus(id: number, status: TeacherStatus): Promise<Teacher> {
  return patch<Teacher>(`/admin/users/${id}/status`, { status });
}
