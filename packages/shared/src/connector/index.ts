/**
 * 连接器类型契约 — 可复用的外部 API 调用配置。
 *
 * 飞书对齐 Module F：连接器与集成。
 * 连接器实体 + 凭证管理 + HTTP 调用引擎 + Webhook 入站接收。
 */

// ---------------------------------------------------------------------------
// 枚举
// ---------------------------------------------------------------------------

/** 连接器类型。 */
export type ConnectorType = 'HTTP' | 'WEBHOOK';

/** 凭证类型。 */
export type CredentialType = 'BASIC' | 'API_KEY' | 'BEARER';

/** 连接器状态。 */
export type ConnectorStatus = 'ACTIVE' | 'INACTIVE';

// ---------------------------------------------------------------------------
// 连接器操作定义（HTTP 类型专用）
// ---------------------------------------------------------------------------

/** 单个 API 端点定义。 */
export interface ConnectorOperation {
  /** 操作 ID（唯一） */
  id: string;
  /** 操作名称 */
  name: string;
  /** HTTP 方法 */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** 相对于 baseUrl 的路径，如 /users/{id} */
  path: string;
  /** 描述 */
  description?: string;
}

// ---------------------------------------------------------------------------
// 连接器配置（按类型区分）
// ---------------------------------------------------------------------------

/** HTTP 连接器配置。 */
export interface HttpConnectorConfig {
  /** 默认请求头 */
  defaultHeaders?: Record<string, string>;
  /** 默认超时（毫秒），默认 10000 */
  timeout?: number;
  /** API 操作定义 */
  operations?: ConnectorOperation[];
}

/** Webhook 连接器配置。 */
export interface WebhookConnectorConfig {
  /** 允许的 HTTP 方法 */
  allowedMethods: string[];
  /** 自定义验证头名（可选，默认通过 URL token 验证） */
  verifyHeader?: string;
}

// ---------------------------------------------------------------------------
// 凭证数据（按类型区分）
// ---------------------------------------------------------------------------

/** Basic Auth 凭证数据。 */
export interface BasicCredentialData {
  username: string;
  password: string;
}

/** API Key 凭证数据。 */
export interface ApiKeyCredentialData {
  /** 请求头名称，如 X-API-Key */
  headerName: string;
  apiKey: string;
}

/** Bearer Token 凭证数据。 */
export interface BearerCredentialData {
  token: string;
}

// ---------------------------------------------------------------------------
// 实体接口
// ---------------------------------------------------------------------------

/** 连接器实体。 */
export interface Connector {
  id: string;
  tenantId: string;
  appId: string;
  apiName: string;
  name: string;
  description?: string;
  type: ConnectorType;
  baseUrl?: string;
  config: Record<string, unknown>;
  credentialId?: string;
  status: ConnectorStatus;
  /** Webhook 专用：入站验证 token */
  webhookToken?: string;
  createdAt: string;
  updatedAt: string;
}

/** 凭证实体（列表返回时不包含敏感数据）。 */
export interface ConnectorCredential {
  id: string;
  tenantId: string;
  appId: string;
  name: string;
  type: CredentialType;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// 请求 DTO
// ---------------------------------------------------------------------------

/** 创建连接器请求。 */
export interface CreateConnectorRequest {
  apiName: string;
  name: string;
  description?: string;
  type: ConnectorType;
  baseUrl?: string;
  config?: Record<string, unknown>;
  credentialId?: string;
}

/** 更新连接器请求。 */
export interface UpdateConnectorRequest {
  name?: string;
  description?: string;
  baseUrl?: string;
  config?: Record<string, unknown>;
  credentialId?: string;
  status?: ConnectorStatus;
}

/** 创建凭证请求。 */
export interface CreateCredentialRequest {
  name: string;
  type: CredentialType;
  /** 凭证数据（明文，后端加密后存储） */
  data: BasicCredentialData | ApiKeyCredentialData | BearerCredentialData;
}

/** 更新凭证请求。 */
export interface UpdateCredentialRequest {
  name?: string;
  data?: BasicCredentialData | ApiKeyCredentialData | BearerCredentialData;
}

/** 测试/调用连接器请求。 */
export interface InvokeConnectorRequest {
  /** 操作 ID（从连接器配置的 operations 中查找） */
  operationId?: string;
  /** 覆盖 HTTP 方法 */
  method?: string;
  /** 覆盖路径（相对于 baseUrl） */
  path?: string;
  /** 额外请求头 */
  headers?: Record<string, string>;
  /** 请求体 */
  body?: string;
  /** 路径参数 / 模板变量 */
  variables?: Record<string, unknown>;
}

/** 连接器调用结果。 */
export interface ConnectorCallResult {
  statusCode: number;
  responseBody: unknown;
  responseHeaders: Record<string, string>;
  success: boolean;
}
