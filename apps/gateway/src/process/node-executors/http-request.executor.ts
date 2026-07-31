/**
 * HttpRequestExecutor — HTTP 请求/连接器节点。
 *
 * 定位：调用外部 API（Phase 5 连接器的前置形态），打通外部系统。
 * 配置项（node.data）：method / url / headers（JSON）/ body（JSON，支持变量插值）/
 *   responseMapping（响应字段 → 变量名映射，可选）。
 * 输出：statusCode / responseBody / 按 responseMapping 映射的字段。
 *
 * url/headers/body 可四态绑定（经引擎解析后存于 inputs）。
 */

import { Injectable, Logger } from '@nestjs/common';
import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '../types.js';
import { renderTemplateDotted } from '../process-utils.js';

@Injectable()
export class HttpRequestExecutor implements NodeExecutor {
  private readonly logger = new Logger(HttpRequestExecutor.name);
  readonly type = 'http_request';

  async execute(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const data = ctx.node.data as Record<string, unknown>;
    const method =
      (data['method'] as string) ?? (ctx.inputs['method'] as string) ?? 'GET';
    const url = (data['url'] as string) ?? (ctx.inputs['url'] as string);
    if (!url) {
      throw new Error('HTTP 请求节点缺少 url');
    }

    const headersRaw = data['headers'] ?? ctx.inputs['headers'];
    const headers = this.parseHeaders(headersRaw);
    const bodyRaw = data['body'] ?? ctx.inputs['body'];

    // 构建渲染作用域（同通知节点）
    const globalVars = (ctx.variables['global'] as Record<string, unknown>) ?? {};
    const renderScope: Record<string, unknown> = { ...ctx.variables, ...globalVars };

    // body 支持模版插值
    let bodyStr: string | undefined;
    if (bodyRaw !== undefined && bodyRaw !== null) {
      bodyStr = typeof bodyRaw === 'string'
        ? renderTemplateDotted(bodyRaw, renderScope)
        : JSON.stringify(bodyRaw);
    }

    this.logger.log(`HTTP ${method} ${url}`);

    const resp = await fetch(url, {
      method,
      headers,
      body: bodyStr,
    });
    const respText = await resp.text();
    let responseBody: unknown = respText;
    try {
      responseBody = JSON.parse(respText);
    } catch {
      // 非 JSON，保留原始文本
    }

    const output: Record<string, unknown> = {
      statusCode: resp.status,
      responseBody,
      success: resp.ok,
    };

    // 按 responseMapping 映射字段到全局变量
    const responseMapping = (data['responseMapping'] as Record<string, string> | undefined) ??
      (data['response_mapping'] as Record<string, string> | undefined);
    if (responseMapping) {
      const global = (ctx.variables['global'] as Record<string, unknown>) ?? {};
      for (const [fieldPath, varName] of Object.entries(responseMapping)) {
        global[varName] = this.extractPath(responseBody, fieldPath);
      }
      ctx.variables['global'] = global;
    }

    if (!resp.ok) {
      this.logger.warn(`HTTP 请求失败: ${resp.status} ${url}`);
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
