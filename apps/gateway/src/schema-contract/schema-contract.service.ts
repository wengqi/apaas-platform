/**
 * SchemaContractService — 校验合同门面（G3）。
 *
 * 统一入口：validate(kind, schema, ctx) → { valid, issues }。
 * assertValid 抛 BadRequest（issues 摘要），供 G4 MCP 写路径与治理轨道调用。
 * 设计原则：校验纯函数化（无 prisma 依赖），跨引用经 ctx 显式传入。
 */

import { Injectable, BadRequestException } from '@nestjs/common';
import type { SchemaIssue, SchemaKind, SchemaValidationResult } from '@apaas/shared';
import { validateAmisPage } from './validators/amis-page.validator.js';
import {
  validateWorkflow,
  type WorkflowValidationContext,
} from './validators/workflow.validator.js';
import { validateObjectMeta } from './validators/object-meta.validator.js';
import { validateDataset } from './validators/dataset.validator.js';

/** 校验上下文：跨引用信息（可选，缺省跳过引用校验防误报）。 */
export interface SchemaValidationContext {
  /** 平台已存在的页面 ID 集（workflow.user_task.pageId 校验） */
  pageIds?: ReadonlySet<string>;
}

@Injectable()
export class SchemaContractService {
  /** 校验指定种类的 schema。 */
  validate(
    kind: SchemaKind,
    schema: unknown,
    ctx: SchemaValidationContext = {},
  ): SchemaValidationResult {
    let issues: SchemaIssue[];
    switch (kind) {
      case 'amis_page':
        issues = validateAmisPage(schema);
        break;
      case 'workflow':
        issues = validateWorkflow(schema, ctx as WorkflowValidationContext);
        break;
      case 'object_meta':
        issues = validateObjectMeta(schema);
        break;
      case 'dataset':
        issues = validateDataset(schema);
        break;
      default: {
        const exhaustive: never = kind;
        issues = [
          {
            path: '',
            code: 'ROOT_INVALID',
            message: `未知 schema 种类: ${String(exhaustive)}`,
            severity: 'error',
          },
        ];
      }
    }
    return {
      kind,
      valid: issues.every((i) => i.severity !== 'error'),
      issues,
    };
  }

  /** 校验并拒绝：非法时抛 BadRequest（消息含全部 issue 摘要）。 */
  assertValid(
    kind: SchemaKind,
    schema: unknown,
    ctx: SchemaValidationContext = {},
  ): SchemaValidationResult {
    const result = this.validate(kind, schema, ctx);
    if (!result.valid) {
      const summary = result.issues
        .filter((i) => i.severity === 'error')
        .map((i) => `[${i.path}] ${i.message}`)
        .join('；');
      throw new BadRequestException({
        code: 'SCHEMA_CONTRACT_VIOLATION',
        message: `schema 未通过校验合同（${kind}）：${summary}`,
        issues: result.issues,
      });
    }
    return result;
  }
}
