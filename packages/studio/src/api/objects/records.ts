/**
 * 从 api/objects.ts 拆分（AGENTS.md 单文件 400 行规范）。
 *
 * 记录(运行时数据)相关 API 封装,挂在 objectsApi.records。
 */

import client from '../client.js';
import type { ApiResponse } from '../client.js';
import type { PaginatedRecords, QueryRecordsParams, RecordItem } from './types.js';

export const recordsApi = {
  /** 分页查询记录(支持筛选/排序) */
  list: (objectId: string, params: QueryRecordsParams) =>
    client
      .get<ApiResponse<PaginatedRecords>>(`/api/objects/${objectId}/records`, {
        params: {
          page: params.page,
          pageSize: params.pageSize,
          sort: params.sort,
          filter: params.filter,
        },
      })
      .then((res) => res.data.data as PaginatedRecords),

  /** 创建记录 — 后端契约：body 即字段键值对（key 为 apiName），不要再包一层 data */
  create: (objectId: string, data: Record<string, unknown>) =>
    client
      .post<ApiResponse<RecordItem>>(`/api/objects/${objectId}/records`, data)
      .then((res) => res.data.data as RecordItem),

  /** 更新记录(部分更新) — 同创建契约，body 即字段键值对 */
  update: (recordId: string, data: Record<string, unknown>) =>
    client
      .put<ApiResponse<RecordItem>>(`/api/records/${recordId}`, data)
      .then((res) => res.data.data as RecordItem),

  /** 删除记录 */
  delete: (recordId: string) =>
    client
      .delete<ApiResponse<{ deleted: boolean }>>(`/api/records/${recordId}`)
      .then((res) => res.data.data as { deleted: boolean }),

  /** 批量创建记录 */
  batchCreate: (objectId: string, records: Record<string, unknown>[]) =>
    client
      .post<ApiResponse<{ created: number; errors: Array<{ row: number; message: string }> }>>(
        `/api/objects/${objectId}/records/batch-create`,
        { records },
      )
      .then((res) => res.data.data!),

  /** 批量更新记录 */
  batchUpdate: (recordIds: string[], data: Record<string, unknown>) =>
    client
      .put<ApiResponse<{ updated: number; errors: Array<{ row: number; message: string }> }>>(
        `/api/records/batch-update`,
        { recordIds, data },
      )
      .then((res) => res.data.data!),

  /** 批量删除记录 */
  batchDelete: (recordIds: string[]) =>
    client
      .post<ApiResponse<{ deleted: number }>>(`/api/records/batch-delete`, { recordIds })
      .then((res) => res.data.data!),

  /** 导出记录为 CSV（返回 blob） */
  exportCsv: (objectId: string, params: { sort?: string; filter?: string }) =>
    client
      .get(`/api/objects/${objectId}/records/export`, {
        params,
        responseType: 'blob',
      })
      .then((res) => res.data as Blob),

  /** 从 CSV 导入记录（FormData 上传） */
  importCsv: (objectId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return client
      .post<
        ApiResponse<{
          total: number;
          success: number;
          errors: Array<{ row: number; message: string }>;
        }>
      >(`/api/objects/${objectId}/records/import`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((res) => res.data.data!);
  },

  /** 下载导入模板 CSV（返回 blob） */
  getImportTemplate: (objectId: string) =>
    client
      .get(`/api/objects/${objectId}/records/import-template`, { responseType: 'blob' })
      .then((res) => res.data as Blob),
};
