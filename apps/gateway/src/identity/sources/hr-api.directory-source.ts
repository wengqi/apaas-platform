/**
 * 人力主数据 HTTP 目录源适配器 — 通用 REST 拉取（业界通用对接标准）。
 *
 * - 鉴权：请求头注入（如 Authorization: Bearer / X-API-Key），headers 整体加密存储
 * - 分页：none（一次性返回）/ page（page & pageSize 查询参数，响应为当页数组，短页即止，上限 100 页）
 * - dataPath：响应中人员数组的点号路径（如 data.list；缺省 = 根数组）
 * - fieldMap：标准字段（externalId/name/email/mobile/departmentExternalId）→ 接口字段名
 * 部门树 v1 不从该源拉取（返回空），组织树由 LDAP 源维护。
 */

import type {
  DeptRecord,
  DirectorySource,
  HrApiConfig,
  UserRecord,
} from '../external-identity.types.js';

const MAX_PAGES = 100;

/** 按点号路径取嵌套值（data.list → obj.data.list） */
export function resolvePath(obj: unknown, path?: string): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur && typeof cur === 'object' && key in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return cur;
}

export class HrApiDirectorySource implements DirectorySource {
  readonly type = 'hr-api' as const;
  readonly supportsIncremental = false;

  constructor(private readonly config: HrApiConfig) {}

  async pullDepartments(): Promise<DeptRecord[]> {
    return [];
  }

  async pullUsers(): Promise<UserRecord[]> {
    if (this.config.paging === 'none') {
      const rows = await this.fetchPage(undefined, undefined);
      return rows;
    }
    const all: UserRecord[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const rows = await this.fetchPage(page, this.config.pageSize ?? 500);
      all.push(...rows);
      if (rows.length < (this.config.pageSize ?? 500)) break;
    }
    return all;
  }

  private async fetchPage(page?: number, pageSize?: number): Promise<UserRecord[]> {
    const url = new URL(this.config.url);
    if (page !== undefined) {
      url.searchParams.set('page', String(page));
      url.searchParams.set('pageSize', String(pageSize ?? 500));
    }
    const res = await fetch(url, {
      method: this.config.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', ...(this.config.headers ?? {}) },
    });
    if (!res.ok) {
      throw new Error(`人力主数据接口请求失败：HTTP ${res.status}`);
    }
    const body: unknown = await res.json();
    const list = resolvePath(body, this.config.dataPath);
    if (!Array.isArray(list)) {
      throw new Error(
        `人力主数据接口响应不符合预期：dataPath=${this.config.dataPath ?? '(root)'} 未取到数组`,
      );
    }
    const map = this.config.fieldMap;
    return list
      .filter((row): row is Record<string, unknown> => row !== null && typeof row === 'object')
      .map((row) => {
        const pick = (field?: string) =>
          field === undefined ? undefined : (row[field] as string | number | undefined);
        const externalId = pick(map.externalId);
        if (externalId === undefined || externalId === '') {
          throw new Error(`人力主数据记录缺少唯一键字段 ${map.externalId}`);
        }
        const department = pick(map.departmentExternalId);
        return {
          externalId: String(externalId),
          name: String(pick(map.name) ?? externalId),
          email: pick(map.email) === undefined ? undefined : String(pick(map.email)),
          mobile: pick(map.mobile) === undefined ? undefined : String(pick(map.mobile)),
          departmentExternalId: department === undefined ? undefined : String(department),
        };
      });
  }
}
