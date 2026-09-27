/**
 * 企业身份对接 — 通用抽象与配置类型。
 *
 * 两层抽象（见 docs/design/DESIGN-identity-env-versioning-2026-09-27.md）：
 * - AuthProvider：认证（"人是谁"）— CAS / 飞书 OAuth / 本地
 * - DirectorySource：目录（"组织长什么样"）— LDAP / 人力主数据接口 / 飞书通讯录
 * 适配器按租户级 IntegrationConfig(type, config) 注册，新增生态只需实现接口。
 */

export interface ExternalIdentity {
  /** 源系统全局唯一键（CAS username / 工号 employeeNumber / entryUUID） */
  externalId: string;
  name: string;
  email?: string;
  mobile?: string;
  /** 所属部门的外部唯一键（LDAP 部门 DN 的稳定标识 / HR 部门编码） */
  departmentExternalId?: string;
  /** 原始属性（调试/映射规则排查用，不落业务表） */
  raw: Record<string, unknown>;
}

export interface DeptRecord {
  externalId: string;
  name: string;
  parentExternalId: string | null;
}

export interface UserRecord {
  externalId: string;
  name: string;
  email?: string;
  mobile?: string;
  departmentExternalId?: string;
}

// ---------------------------------------------------------------------------
// AuthProvider（认证）
// ---------------------------------------------------------------------------

export interface CasConfig {
  /** CAS 服务端基址，如 https://sso.example.com/cas */
  baseUrl: string;
  /** 平台回调地址（CAS 的 service 参数），需含 tenant 标识 */
  serviceUrl: string;
}

export interface AuthProvider {
  readonly type: 'cas' | 'feishu' | 'oauth2';
  /** 生成跳转外部登录页的 URL */
  buildLoginUrl(): string;
  /** 用回调参数换取外部身份（CAS: ticket 校验；OAuth2: code 换 token） */
  handleCallback(query: Record<string, string>): Promise<ExternalIdentity>;
}

// ---------------------------------------------------------------------------
// DirectorySource（目录）
// ---------------------------------------------------------------------------

export interface DeptRecord {
  externalId: string;
  name: string;
  parentExternalId: string | null;
}

export interface UserRecord {
  externalId: string;
  name: string;
  email?: string;
  mobile?: string;
  departmentExternalId?: string;
}

export interface DirectorySource {
  readonly type: 'ldap' | 'hr-api' | 'feishu' | 'manual';
  /** 是否支持增量拉取（首版适配器均为全量 false） */
  readonly supportsIncremental: boolean;
  pullDepartments(): Promise<DeptRecord[]>;
  pullUsers(): Promise<UserRecord[]>;
}

// ---------------------------------------------------------------------------
// 配置结构（IntegrationConfig.config 按 type 区分；敏感字段加密后内联存储）
// ---------------------------------------------------------------------------

export interface LdapConfig {
  url: string;
  /** 绑定账号（可空 = 匿名绑定）；bindPassword 加密存储 */
  bindDn?: string;
  bindPassword?: string;
  userBaseDn: string;
  /** 默认 (objectClass=person) */
  userFilter?: string;
  /** 部门节点基址与过滤器（默认 (objectClass=organizationalUnit)） */
  departmentBaseDn: string;
  departmentFilter?: string;
  /** 属性映射：标准字段 → LDAP 属性名 */
  attrMap: {
    externalId: string; // 默认 employeeNumber
    name: string; // 默认 cn
    email?: string; // 默认 mail
    departmentExternalId?: string; // 默认 departmentNumber
    departmentName?: string; // 默认 ou
  };
}

export interface HrApiConfig {
  url: string;
  method?: 'GET' | 'POST';
  /** 请求头（可含 token；整体加密存储） */
  headers?: Record<string, string>;
  /** 响应中人员数组的取值路径（点号分隔，如 data.list；缺省=根数组） */
  dataPath?: string;
  paging: 'none' | 'page';
  pageSize?: number;
  /** 字段映射：标准字段 → 接口字段名 */
  fieldMap: {
    externalId: string;
    name: string;
    email?: string;
    mobile?: string;
    departmentExternalId?: string;
  };
}
