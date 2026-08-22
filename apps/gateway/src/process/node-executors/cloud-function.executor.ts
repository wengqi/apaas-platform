/**
 * 云函数节点执行器 — 在流程中调用用户自定义的云函数。
 *
 * 节点 data 配置：
 *   - cloudFunctionId: 云函数 ID
 *   - inputMapping: 变量路径 → 参数名映射（可选）
 *   - resultVariable: 结果写入的变量名（可选）
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import type { NodeExecutor, NodeExecutionResult, ExecutionContext } from '../types.js';
import { CloudFunctionService } from '../../cloud-function/cloud-function.service.js';

@Injectable()
export class CloudFunctionExecutor implements NodeExecutor {
  private readonly logger = new Logger(CloudFunctionExecutor.name);
  readonly type = 'cloud_function';

  constructor(private readonly cloudFunctionService: CloudFunctionService) {}

  async execute(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const cloudFunctionId = ctx.node.data['cloudFunctionId'] as string;
    if (!cloudFunctionId) {
      throw new BadRequestException('云函数节点未配置 cloudFunctionId');
    }

    // 从 inputMapping 构建输入参数
    const inputMapping = (ctx.node.data['inputMapping'] as Record<string, string>) ?? {};
    const input: Record<string, unknown> = {};
    for (const [paramName, varPath] of Object.entries(inputMapping)) {
      input[paramName] = this.resolveVariable(varPath, ctx.variables);
    }

    // 如果没有 inputMapping，直接传入整个 variables 作为 input
    if (Object.keys(input).length === 0) {
      Object.assign(input, ctx.variables);
    }

    this.logger.log(
      `实例 ${ctx.instance.id} 调用云函数 ${cloudFunctionId}，参数: ${Object.keys(input).join(', ')}`,
    );

    const result = await this.cloudFunctionService.invoke(ctx.tenantId, cloudFunctionId, { input });

    if (!result.success) {
      this.logger.warn(
        `实例 ${ctx.instance.id} 云函数 ${cloudFunctionId} 执行失败: ${result.error}`,
      );
      // 云函数执行失败不阻断流程，将错误信息写入输出
      return {
        output: {
          success: false,
          error: result.error,
          logs: result.logs,
          durationMs: result.durationMs,
        },
      };
    }

    this.logger.log(
      `实例 ${ctx.instance.id} 云函数 ${cloudFunctionId} 执行成功，耗时 ${result.durationMs}ms`,
    );

    // 如果配置了 resultVariable，将结果写入流程变量
    const resultVariable = ctx.node.data['resultVariable'] as string | undefined;
    if (resultVariable && result.result !== undefined) {
      this.setVariable(resultVariable, result.result, ctx.variables);
    }

    return {
      output: {
        success: true,
        result: result.result,
        logs: result.logs,
        durationMs: result.durationMs,
      },
    };
  }

  /**
   * 从流程变量作用域中解析变量路径。
   * 支持 'global.fieldName' / 'nodeId.output.field' 格式。
   */
  private resolveVariable(path: string, variables: Record<string, unknown>): unknown {
    const parts = path.split('.');
    let current: unknown = variables;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return current;
  }

  /**
   * 将值写入流程变量作用域。
   * 支持 'global.fieldName' / 'nodeId.output.field' 格式。
   */
  private setVariable(path: string, value: unknown, variables: Record<string, unknown>): void {
    const parts = path.split('.');
    let current: unknown = variables;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return;
      }
    }
    const lastKey = parts[parts.length - 1]!;
    if (current && typeof current === 'object') {
      (current as Record<string, unknown>)[lastKey] = value;
    }
  }
}
