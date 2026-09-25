/**
 * 连接器 API 客户端 — Studio 用。
 * 对接 Gateway 的 /api/apps/:appId/connectors 和 /api/credentials 端点。
 */

import client from './client.js';
import type { ApiResponse } from './client.js';

// ---------------------------------------------------------------------------
// 类型定义（与 @apaas/shared/connector 对齐，前端独立声明）
// ---------------------------------------------------------------------------

export type ConnectorType = 'HTTP' | 'WEBHOOK';
export type CredentialType = 'BASIC' | 'API_KEY' | 'BEARER' | 'OAUTH2';
export type ConnectorStatus = 'ACTIVE' | 'INACTIVE';

export interface ConnectorOperation {
  id: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description?: string;
}

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
  webhookToken?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorCredential {
  id: string;
  tenantId: string;
  appId: string;
  name: string;
  type: CredentialType;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConnectorRequest {
  apiName: string;
  name: string;
  description?: string;
  type: ConnectorType;
  baseUrl?: string;
  config?: Record<string, unknown>;
  credentialId?: string;
}

export interface UpdateConnectorRequest {
  name?: string;
  description?: string;
  baseUrl?: string;
  config?: Record<string, unknown>;
  credentialId?: string;
  status?: ConnectorStatus;
}

export interface CreateCredentialRequest {
  name: string;
  type: CredentialType;
  data: Record<string, string>;
}

export interface UpdateCredentialRequest {
  name?: string;
  data?: Record<string, string>;
}

export interface InvokeConnectorRequest {
  operationId?: string;
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  body?: string;
  variables?: Record<string, unknown>;
}

export interface ConnectorCallResult {
  statusCode: number;
  responseBody: unknown;
  responseHeaders: Record<string, string>;
  success: boolean;
}

// ---------------------------------------------------------------------------
// API 封装
// ---------------------------------------------------------------------------

const unwrap = <T>(p: Promise<{ data: ApiResponse<T> }>) => p.then((res) => res.data.data as T);

/** 连接器 API。 */
export const connectorsApi = {
  list: (appId: string) => unwrap<Connector[]>(client.get(`/api/apps/${appId}/connectors`)),
  get: (connectorId: string) => unwrap<Connector>(client.get(`/api/connectors/${connectorId}`)),
  create: (appId: string, data: CreateConnectorRequest) =>
    unwrap<Connector>(client.post(`/api/apps/${appId}/connectors`, data)),
  update: (connectorId: string, data: UpdateConnectorRequest) =>
    unwrap<Connector>(client.put(`/api/connectors/${connectorId}`, data)),
  delete: (connectorId: string) =>
    unwrap<{ deleted: boolean }>(client.delete(`/api/connectors/${connectorId}`)),
  test: (connectorId: string, params: InvokeConnectorRequest) =>
    unwrap<ConnectorCallResult>(client.post(`/api/connectors/${connectorId}/test`, params)),
  invoke: (connectorId: string, params: InvokeConnectorRequest) =>
    unwrap<ConnectorCallResult>(client.post(`/api/connectors/${connectorId}/invoke`, params)),
};

/** 凭证 API。 */
export const credentialsApi = {
  list: (appId: string) =>
    unwrap<ConnectorCredential[]>(client.get(`/api/apps/${appId}/credentials`)),
  create: (appId: string, data: CreateCredentialRequest) =>
    unwrap<ConnectorCredential>(client.post(`/api/apps/${appId}/credentials`, data)),
  update: (credentialId: string, data: UpdateCredentialRequest) =>
    unwrap<ConnectorCredential>(client.put(`/api/credentials/${credentialId}`, data)),
  delete: (credentialId: string) =>
    unwrap<{ deleted: boolean }>(client.delete(`/api/credentials/${credentialId}`)),
};
