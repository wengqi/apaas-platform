import client from './client.js';
import type { ApiResponse } from './client.js';

/**
 * 应用概要（列表页用，不含快照等重字段）。
 * 与后端 GET /api/design/apps 返回的 AppSummary 对齐。
 */
export interface AppSummary {
  id: string;
  apiName: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  /** 应用分组（空=未分组） */
  group?: string;
  /** 所有者姓名（设计面列表返回 OWNER 成员姓名；协作卡片据此显示「由 X 共享」） */
  ownerName?: string;
  /** 当前用户对该应用的归属角色（ADR-0005）：admin 恒全量 / owner 所有者 / member 协作者 */
  myRole?: 'admin' | 'owner' | 'member';
  status: string;
  version: number;
  stats: { objects: number; pages: number; processes: number };
  createdAt: string;
  updatedAt: string;
}

/** 创建应用请求体。 */
export interface CreateAppRequest {
  apiName?: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  /** 应用分组（≤20 字符；可顺手新建） */
  group?: string;
}

/**
 * 应用 API 封装。
 *
 * 后端响应统一包裹为 { ok: true, data: ... }，
 * 这里取 res.data.data，直接返回业务数据。
 */
export const appsApi = {
  list: () =>
    client
      .get<ApiResponse<AppSummary[]>>('/api/design/apps')
      .then((res) => res.data.data as AppSummary[]),
  get: (appId: string) =>
    client
      .get<ApiResponse<AppSummary>>(`/api/design/apps/${appId}`)
      .then((res) => res.data.data as AppSummary),
  create: (data: CreateAppRequest) =>
    client
      .post<ApiResponse<AppSummary>>('/api/design/apps', data)
      .then((res) => res.data.data as AppSummary),
  // group 允许显式 null（= 移入未分组）：后端 UpdateAppDto @IsOptional 对 null 跳过校验，
  // service 原样透传给 Prisma 置 NULL。须 Omit 后重声明——直接交叉会取交集把 null 消掉；
  // api 层单点放宽，禁止调用点用 as 绕过（D-011 教训）。
  update: (
    appId: string,
    data: Omit<Partial<CreateAppRequest>, 'group'> & { group?: string | null },
  ) =>
    client
      .put<ApiResponse<AppSummary>>(`/api/design/apps/${appId}`, data)
      .then((res) => res.data.data as AppSummary),
  delete: (appId: string) =>
    client
      .delete<ApiResponse<{ deleted: boolean }>>(`/api/design/apps/${appId}`)
      .then((res) => res.data.data as { deleted: boolean }),
  /** 分组管理：重命名（from→to）或删除分组（to 空 → 移入未分组）。 */
  updateGroup: (from: string, to?: string) =>
    client
      .patch<ApiResponse<{ updated: number }>>('/api/design/apps/groups', { from, to })
      .then((res) => {
        // 契约防御：data.updated 缺失（契约漂移/网关兜底响应）显式报错，
        // 不允许 as 断言掩盖后在调用点炸出无提示的 TypeError
        const payload = res.data.data;
        if (typeof payload?.updated !== 'number') {
          throw new Error('分组接口响应格式异常（data.updated 缺失）');
        }
        return { updated: payload.updated };
      }),
  archive: (appId: string) =>
    client
      .post<ApiResponse<AppSummary>>(`/api/design/apps/${appId}/archive`)
      .then((res) => res.data.data as AppSummary),
};
