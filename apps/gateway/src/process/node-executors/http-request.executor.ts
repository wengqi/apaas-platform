/**
 * HttpRequestExecutor — HTTP 请求/连接器节点。
 *
 * 支持两种模式：
 * 1. 连接器模式（connectorId 存在）：通过 ConnectorCallService 调用已配置的连接器，
 *    自动注入凭证、baseUrl、默认 headers。
 * 2. 直连模式（connectorId 不存在）：直接 fetch，向后兼容。
 *
 * 配置项（node.data）：
 *   - connectorId?: string      — 连接器 ID（选择后使用连接器配置）
 *   - operationId?: string      — 连接器操作 ID
 *   - method / url / headers / body / responseMapping — 直连模式参数
 * 输出：statusCode / responseBody / success + responseMapping 映射字段
 */

import { Injectable, Logger } from '@nestjs/common';
import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '../types.js';
import { renderTemplateDotted } from '../process-utils.js';
import { ConnectorService } from '../../connector/connector.service.js';
import { ConnectorCallService } from '../../connector/connector-call.service.js';
import {
  assertSafeOutboundUrl,
  safeFetch,
  outboundTimeoutMs,
} from '../../common/net/ssrf-guard.js';

@Injectable()
export class HttpRequestExecutor implements NodeExecutor {
  private readonly logger = new Logger(HttpRequestExecutor.name);
  readonly type = 'http_request';

  constructor(
    private readonly connectorService: ConnectorService,
    private readonly callService: ConnectorCallService,
  ) {}

  async execute(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const data = ctx.node.data as Record<string, unknown>;
    const connectorId = (data['connectorId'] as string) ?? (ctx.inputs['connectorId'] as string);

    // 构建渲染作用域
    const globalVars = (ctx.variables['global'] as Record<string, unknown>) ?? {};
    const renderScope: Record<string, unknown> = { ...ctx.variables, ...globalVars };

    let statusCode: number;
    let responseBody: unknown;

    if (connectorId) {
      // 连接器模式
      const connector = await this.connectorService.getEntity(ctx.tenantId, connectorId);
      const operationId = (data['operationId'] as string) ?? undefined;
      const method = (data['method'] as string) ?? undefined;
      const path = (data['path'] as string) ?? undefined;
      const headersRaw = data['headers'] ?? ctx.inputs['headers'];
      const headers = this.parseHeaders(headersRaw);
      const bodyRaw = data['body'] ?? ctx.inputs['body'];
      let bodyStr: string | undefined;
      if (bodyRaw !== undefined && bodyRaw !== null) {
        bodyStr =
          typeof bodyRaw === 'string'
            ? renderTemplateDotted(bodyRaw, renderScope)
            : JSON.stringify(bodyRaw);
      }

      const result = await this.callService.invoke(connector, {
        operationId,
        method,
        path,
        headers,
        body: bodyStr,
        variables: renderScope,
      });

      statusCode = result.statusCode;
      responseBody = result.responseBody;

      this.logger.log(`连接器调用 ${connector.name}: ${result.statusCode}`);
    } else {
      // 直连模式（向后兼容）
      const method = (data['method'] as string) ?? (ctx.inputs['method'] as string) ?? 'GET';
      const url = (data['url'] as string) ?? (ctx.inputs['url'] as string);
      if (!url) {
        throw new Error('HTTP 请求节点缺少 url 或 connectorId');
      }

      const headersRaw = data['headers'] ?? ctx.inputs['headers'];
      const headers = this.parseHeaders(headersRaw);
      const bodyRaw = data['body'] ?? ctx.inputs['body'];
      let bodyStr: string | undefined;
      if (bodyRaw !== undefined && bodyRaw !== null) {
        bodyStr =
          typeof bodyRaw === 'string'
            ? renderTemplateDotted(bodyRaw, renderScope)
            : JSON.stringify(bodyRaw);
      }

      this.logger.log(`HTTP ${method} ${url}`);
      // 评审 H-3/P2-4：出站 SSRF 校验 + 超时（直连模式同样受限）
      await assertSafeOutboundUrl(url);
      const resp = await safeFetch(url, {
        method,
        headers,
        body: bodyStr,
        signal: AbortSignal.timeout(outboundTimeoutMs()),
      });
      const respText = await resp.text();
      try {
        responseBody = JSON.parse(respText);
      } catch {
        responseBody = respText;
      }
      statusCode = resp.status;

      if (!resp.ok) {
        this.logger.warn(`HTTP 请求失败: ${resp.status} ${url}`);
      }
    }

    const output: Record<string, unknown> = {
      statusCode,
      responseBody,
      success: statusCode >= 200 && statusCode < 300,
    };

    // 按 responseMapping 映射字段到全局变量
    const responseMapping =
      (data['responseMapping'] as Record<string, string> | undefined) ??
      (data['response_mapping'] as Record<string, string> | undefined);
    if (responseMapping) {
      const global = (ctx.variables['global'] as Record<string, unknown>) ?? {};
      for (const [fieldPath, varName] of Object.entries(responseMapping)) {
        global[varName] = this.extractPath(responseBody, fieldPath);
      }
      ctx.variables['global'] = global;
    }

    return { output };
  }

  private parseHeaders(raw: unknown): Record<string, string> {
    if (!raw) return {};
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as Record<string, string>;
      } catch {
        return {};
      }
    }
    return raw as Record<string, string>;
  }

  /** 沿点分路径从响应体提取字段值。 */
  private extractPath(obj: unknown, path: string): unknown {
    if (!path) return obj;
    let current: unknown = obj;
    for (const segment of path.split('.')) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }
}
