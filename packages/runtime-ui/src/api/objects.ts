/**
 * 对象记录 API 客户端 — Runtime UI 用。
 * 对接 Gateway 的记录 CRUD 端点。
 */

import apiClient from './client';

/** 一条记录（业务字段值存于 data）。 */
export interface RecordItem {
  id: string;
  objectId: string;
  data: Record<string, unknown>;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 分页查询结果。 */
export interface PaginatedRecords {
  items: RecordItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** 查询记录参数。 */
export interface QueryRecordsParams {
  page?: number;
  pageSize?: number;
  sort?: string;
  filter?: string;
}

export const objectsApi = {
  records: {
    /** 分页查询记录 */
    list: (objectId: string, params: QueryRecordsParams) =>
      apiClient
        .get(`/objects/${objectId}/records`, {
          params: {
            page: params.page,
            pageSize: params.pageSize,
            sort: params.sort,
            filter: params.filter,
          },
        })
        .then((res) => res.data.data as PaginatedRecords),

    /** 创建记录 */
    create: (objectId: string, data: Record<string, unknown>) =>
      apiClient
        .post(`/objects/${objectId}/records`, { data })
        .then((res) => res.data.data as RecordItem),

    /** 更新记录 */
    update: (recordId: string, data: Record<string, unknown>) =>
      apiClient
        .put(`/records/${recordId}`, { data })
        .then((res) => res.data.data as RecordItem),

    /** 删除记录 */
    delete: (recordId: string) =>
      apiClient
        .delete(`/records/${recordId}`)
        .then((res) => res.data.data as { deleted: boolean }),
  },
};
