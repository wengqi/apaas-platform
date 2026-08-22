/**
 * 连接器调用引擎 — HTTP 执行 + 凭证注入。
 *
 * 被连接器测试端点和流程节点执行器共用。
 * 职责：构建 URL → 合并 headers → 注入凭证 → 模板插值 → fetch → 返回结果。
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { CredentialService } from './credential.service.js';
import { renderTemplateDotted } from '../process/process-utils.js';
import type { ConnectorOperation, HttpConnectorConfig } from '@apaas/shared';
import type { ConnectorCallResult, InvokeConnectorRequest } from '@apaas/shared';

interface ConnectorEntity {
  id: string;
  tenantId: string;
  appId: string;
  type: string;
  baseUrl: string | null;
  config: unknown;
  credentialId: string | null;
}

@Injectable()
export class ConnectorCallService {
  private readonly logger = new Logger(ConnectorCallService.name);

  constructor(private readonly credentialService: CredentialService) {}

  /**
   * 执行连接器调用。
   *
   * @param connector 连接器实体
   * @param params 调用参数（操作/方法/路径/headers/body/变量）
   */
  async invoke(
    connector: ConnectorEntity,
    params: InvokeConnectorRequest,
  ): Promise<ConnectorCallResult> {
    if (connector.type !== 'HTTP') {
      throw new BadRequestException('只有 HTTP 类型的连接器支持调用');
    }

    const config = (connector.config ?? {}) as HttpConnectorConfig;
    const variables = params.variables ?? {};

    // 1. 解析操作（如果指定了 operationId）
    let method = params.method ?? 'GET';
    let path = params.path ?? '';
    if (params.operationId) {
      const op = this.findOperation(config.operations ?? [], params.operationId);
      if (!op) {
        throw new BadRequestException(`操作 ${params.operationId} 不存在`);
      }
      method = op.method;
      path = op.path;
    }

    // 2. 构建 URL
    if (!connector.baseUrl) {
      throw new BadRequestException('连接器未配置 baseUrl');
    }
    // 路径参数替换：/users/{id} → /users/123
    const resolvedPath = this.resolvePathParams(path, variables);
    const url = `${connector.baseUrl}${resolvedPath}`;

    // 3. 合并 headers：defaultHeaders + 凭证注入 + 额外 headers
    let headers: Record<string, string> = { ...(config.defaultHeaders ?? {}) };
    if (connector.credentialId) {
      headers = await this.applyCredential(headers, connector.tenantId, connector.credentialId);
    }
    headers = { ...headers, ...(params.headers ?? {}) };

    // 4. 模板插值 body
    let bodyStr: string | undefined;
    if (params.body) {
      bodyStr = renderTemplateDotted(params.body, variables);
    }

    // 5. fetch 执行
    const timeout = config.timeout ?? 10000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      this.logger.log(`调用连接器 ${connector.id}: ${method} ${url}`);
      const resp = await fetch(url, {
        method,
        headers,
        body: bodyStr,
        signal: controller.signal,
      });

      const responseHeaders: Record<string, string> = {};
      resp.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const text = await resp.text();
      let responseBody: unknown = text;
      try {
        responseBody = JSON.parse(text);
      } catch {
        // 非 JSON 响应，保持文本
      }

      return {
        statusCode: resp.status,
        responseBody,
        responseHeaders,
        success: resp.ok,
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new BadRequestException(`连接器调用超时（${timeout}ms）`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** 注入凭证到请求头。 */
  private async applyCredential(
    headers: Record<string, string>,
    tenantId: string,
    credentialId: string,
  ): Promise<Record<string, string>> {
    const data = await this.credentialService.decrypt(tenantId, credentialId);
    const result = { ...headers };

    if ('username' in data && 'password' in data) {
      // BASIC
      const token = Buffer.from(`${data.username}:${data.password}`).toString('base64');
      result['Authorization'] = `Basic ${token}`;
    } else if ('headerName' in data && 'apiKey' in data) {
      // API_KEY
      result[data.headerName] = data.apiKey;
    } else if ('token' in data) {
      // BEARER
      result['Authorization'] = `Bearer ${data.token}`;
    }

    return result;
  }

  /** 从操作列表中查找操作。 */
  private findOperation(
    operations: ConnectorOperation[],
    operationId: string,
  ): ConnectorOperation | undefined {
    return operations.find((op) => op.id === operationId);
  }

  /** 路径参数替换：/users/{id} + { id: 123 } → /users/123 */
  private resolvePathParams(path: string, variables: Record<string, unknown>): string {
    return path.replace(/\{(\w+)\}/g, (match, key: string) => {
      const value = variables[key];
      return value !== undefined ? String(value) : match;
    });
  }
}
