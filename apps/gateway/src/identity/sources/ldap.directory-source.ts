/**
 * LDAP 目录源适配器 — 实现 DirectorySource（RFC 4511 搜索 + 简单分页）。
 *
 * - 人员：userBaseDn 下按 userFilter（默认 (objectClass=person)）搜索
 * - 部门：departmentBaseDn 下按 departmentFilter（默认 (objectClass=organizationalUnit)）搜索
 * - 部门 externalId 使用条目 DN（树内稳定）；用户的部门默认取其 DN 的上一级 OU（可映射显式属性）
 */

import { Client } from 'ldapts';
import type {
  DeptRecord,
  DirectorySource,
  LdapConfig,
  UserRecord,
} from '../external-identity.types.js';

/** 取 DN 的上一级（父）DN；无父级返回 null */
export function parentDn(dn: string): string | null {
  const idx = dn.indexOf(',');
  return idx === -1 ? null : dn.slice(idx + 1).trim();
}

export class LdapDirectorySource implements DirectorySource {
  readonly type = 'ldap' as const;
  readonly supportsIncremental = false;

  constructor(private readonly config: LdapConfig) {}

  async pullDepartments(): Promise<DeptRecord[]> {
    const client = await this.connect();
    try {
      const { searchEntries } = await client.search(this.config.departmentBaseDn, {
        scope: 'sub',
        filter: this.config.departmentFilter ?? '(objectClass=organizationalUnit)',
        attributes: [
          this.config.attrMap.departmentName ?? 'ou',
          'entryUUID',
          this.config.attrMap.departmentExternalId ?? 'dn',
        ].filter((v): v is string => Boolean(v)),
      });
      return searchEntries.map((entry) => {
        const externalId =
          this.pick(entry, this.config.attrMap.departmentExternalId ?? 'dn') ?? String(entry.dn);
        return {
          externalId,
          name: this.pick(entry, this.config.attrMap.departmentName ?? 'ou') ?? String(entry.dn),
          parentExternalId: parentDn(String(entry.dn)),
        };
      });
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  async pullUsers(): Promise<UserRecord[]> {
    const client = await this.connect();
    try {
      const { searchEntries } = await client.search(this.config.userBaseDn, {
        scope: 'sub',
        filter: this.config.userFilter ?? '(objectClass=person)',
        attributes: [
          this.config.attrMap.externalId,
          this.config.attrMap.name,
          this.config.attrMap.email,
          this.config.attrMap.departmentExternalId,
          'mobile',
        ].filter((v): v is string => Boolean(v)),
      });
      return searchEntries.map((entry) => {
        const externalId = this.pick(entry, this.config.attrMap.externalId);
        if (!externalId) {
          throw new Error(
            `LDAP 条目缺少工号属性 ${this.config.attrMap.externalId}：${String(entry.dn)}`,
          );
        }
        // 部门：优先显式属性；缺省取用户 DN 的父 OU（__dn_parent__ 语义）
        const departmentExternalId =
          (this.config.attrMap.departmentExternalId
            ? this.pick(entry, this.config.attrMap.departmentExternalId)
            : undefined) ??
          parentDn(String(entry.dn)) ??
          undefined;
        return {
          externalId,
          name: this.pick(entry, this.config.attrMap.name) ?? externalId,
          email: this.pick(entry, this.config.attrMap.email ?? 'mail'),
          mobile: this.pick(entry, 'mobile'),
          departmentExternalId,
        };
      });
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  private async connect(): Promise<Client> {
    const client = new Client({ url: this.config.url, timeout: 10_000 });
    if (this.config.bindDn) {
      await client.bind(this.config.bindDn, this.config.bindPassword ?? '');
    }
    return client;
  }

  /** 读条目属性（属性值可能是 string | Buffer | string[]），统一为首个字符串 */
  private pick(entry: Record<string, unknown>, attr: string): string | undefined {
    const value = entry[attr];
    if (typeof value === 'string' && value.length > 0) return value;
    if (Buffer.isBuffer(value)) return value.toString('utf8');
    if (Array.isArray(value) && typeof value[0] === 'string' && value[0].length > 0) {
      return value[0];
    }
    return undefined;
  }
}
