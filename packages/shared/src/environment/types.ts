/**
 * 多环境域共享类型（R1.4）——环境指针 / 发布历史 / 应用环境变量。
 *
 * 设计原则（DESIGN-identity-env-versioning §1）：构建态一套（值与配置分离）；
 * 环境差异全部收敛到「环境变量值 + 环境指针」；版本快照不可变，发布只是切指针。
 */

/** 环境 key（内置 dev/prod，可扩展 staging） */
export type EnvironmentKey = 'dev' | 'prod';

/** 环境 key 白名单（HTTP 参数校验用） */
export const ENVIRONMENT_KEYS = ['dev', 'prod'] as const;

/** HTTP 环境参数缺省值（与现状等价：不指定=prod） */
export const DEFAULT_ENVIRONMENT: EnvironmentKey = 'prod';

/** 环境卡片 DTO（环境管理页） */
export interface AppEnvironmentDto {
  id: string;
  appId: string;
  key: EnvironmentKey;
  currentVersionId: string | null;
  /** 当前生效版本号（冗余展示，从 AppVersion 解析） */
  currentVersionNumber: string | null;
  /** 最近一次部署时间 */
  lastDeployedAt: string | null;
}

/** 发布/回滚历史条目 */
export interface DeploymentDto {
  id: string;
  environmentId: string;
  environmentKey: EnvironmentKey;
  versionId: string;
  versionNumber: string;
  kind: 'deploy' | 'rollback';
  operator: string;
  note: string | null;
  createdAt: string;
}

/** 环境变量定义（构建态一套） */
export interface EnvVarDefDto {
  id: string;
  appId: string;
  key: string;
  description: string | null;
  required: boolean;
  sensitive: boolean;
}

/** 环境变量按环境的值（敏感值 value 恒为 null——写后不可读仅可重置） */
export interface EnvVarValueDto {
  id: string;
  environmentId: string;
  defId: string;
  /** 敏感值恒 null；非敏感值明文 */
  value: string | null;
  /** 是否已设置（敏感值用于展示"已配置"状态） */
  isSet: boolean;
  updatedBy: string;
  updatedAt: string;
}

/** 发布预检结果（G4：必填环境变量 + 破坏性变更警告） */
export interface DeployPreflightDto {
  ok: boolean;
  /** 缺失的必填环境变量 key（G4 硬闸） */
  missingRequired: string[];
  /** 破坏性变更警告（changeSet 含 DELETE/字段删除——半自动，需人工过目） */
  destructiveWarnings: string[];
  /** bundle 中 ${env.*} 引用位置清单（G1 第一版：警告级） */
  envRefWarnings: string[];
  /** 页面（浏览器可达面）引用 sensitive 环境变量的位置（G4 error 级硬闸，对抗审查 security-02） */
  sensitivePageRefs: string[];
}
