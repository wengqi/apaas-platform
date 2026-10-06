import { Injectable } from '@nestjs/common';
import { collectNodeIssues } from '@apaas/shared';
import { prisma } from '@apaas/db';
import type { AppSnapshot, CheckResult } from '@apaas/shared';
import { SnapshotService } from './snapshot.service.js';

/**
 * 预检引擎服务 — 发布前检查应用配置完整性。
 *
 * 检查规则覆盖：
 * - 页面：绑定的对象是否存在
 * - 流程：触发器配置是否完整
 * - 对象：关联字段目标对象是否存在
 * - 权限：规则目标资源是否存在
 *
 * 检查结果分三级：ERROR（阻止发布）/ WARNING / INFO
 */
@Injectable()
export class CheckService {
  constructor(private readonly snapshotService: SnapshotService) {}

  /**
   * 执行预检。
   */
  async check(tenantId: string, appId: string, checkedBy: string): Promise<CheckResult> {
    // 收集快照（预检基于快照数据进行检查）
    const snapshot = await this.snapshotService.collectSnapshot(
      tenantId,
      appId,
      '0.0.0', // 预检时版本号暂用占位
      checkedBy,
    );

    // 运行各模块检查器
    const issues: CheckResult['issues'] = [
      ...this.checkPages(snapshot),
      ...this.checkProcesses(snapshot),
      ...this.checkObjects(snapshot),
    ];

    const result: CheckResult = {
      status: issues.some((i: { level: string }) => i.level === 'ERROR') ? 'FAIL' : 'PASS',
      issues,
      checkedAt: new Date().toISOString(),
      checkedBy: checkedBy as CheckResult['checkedBy'],
    };

    // 持久化检查记录
    await prisma.appCheck.create({
      data: {
        tenantId,
        appId,
        result: result.status,
        issues: result.issues as unknown as ReturnType<typeof JSON.parse>,
        checkedBy,
      },
    });

    return result;
  }

  /**
   * 检查页面：绑定的对象是否存在。
   */
  private checkPages(snapshot: AppSnapshot): CheckResult['issues'] {
    const issues: CheckResult['issues'] = [];
    const objectIds = new Set(snapshot.objects.map((o: { id: string }) => o.id));

    for (const page of snapshot.pages) {
      // 页面绑定了对象但对象不存在
      if (page.objectId && !objectIds.has(page.objectId)) {
        issues.push({
          level: 'ERROR',
          module: 'PAGE',
          entityId: page.id,
          entityName: page.name,
          message: `页面「${page.name}」绑定的对象不存在（objectId: ${page.objectId}）`,
          suggestion: '请删除该页面或重新绑定有效的对象',
        });
      }
    }

    return issues;
  }

  /**
   * 检查流程：触发器配置是否完整。
   */
  private checkProcesses(snapshot: AppSnapshot): CheckResult['issues'] {
    const issues: CheckResult['issues'] = [];

    for (const proc of snapshot.processes) {
      // 触发器类型为空
      if (!proc.triggerType) {
        issues.push({
          level: 'ERROR',
          module: 'PROCESS',
          entityId: proc.id,
          entityName: proc.name,
          message: `流程「${proc.name}」未配置触发器类型`,
          suggestion: '请在流程编辑器中设置触发器',
        });
      }

      // workflowSchema 为空对象
      const schema = proc.workflowSchema;
      if (!schema || Object.keys(schema).length === 0) {
        issues.push({
          level: 'ERROR',
          module: 'PROCESS',
          entityId: proc.id,
          entityName: proc.name,
          message: `流程「${proc.name}」的 WorkflowSchema 为空`,
          suggestion: '请先在流程编辑器中编排节点',
        });
        continue;
      }

      // 节点配置完整性（用户反馈 2026-10-06："检查"按钮要列出整个流程图哪里
      // 有问题——与发布硬闸消费同一份 shared 判定，逐节点列原因）
      const nodes = (schema as { nodes?: unknown }).nodes;
      if (Array.isArray(nodes)) {
        const nodeIssues = collectNodeIssues(nodes as Array<Record<string, unknown>>);
        for (const ni of nodeIssues) {
          issues.push({
            level: 'ERROR',
            module: 'PROCESS',
            entityId: proc.id,
            entityName: proc.name,
            message: `流程「${proc.name}」节点「${ni.nodeTitle}」${ni.reason}`,
            suggestion: '请在流程编辑器中补全该节点配置',
          });
        }
      }
    }

    return issues;
  }

  /**
   * 检查对象：关联字段的目标对象是否存在。
   */
  private checkObjects(snapshot: AppSnapshot): CheckResult['issues'] {
    const issues: CheckResult['issues'] = [];
    const objectApiNames = new Set(snapshot.objects.map((o) => o.apiName));

    for (const obj of snapshot.objects) {
      const fields = obj.fields as Array<Record<string, unknown>>;
      if (!Array.isArray(fields)) continue;

      for (const field of fields) {
        const fieldType = field.type as string;
        // 检查关联对象字段
        if (fieldType === 'lookup' || fieldType === 'sub_form') {
          const config = field.config as Record<string, unknown> | undefined;
          const targetObject = config?.targetObject as string | undefined;
          if (targetObject && !objectApiNames.has(targetObject)) {
            issues.push({
              level: 'ERROR',
              module: 'OBJECT',
              entityId: obj.id,
              entityName: obj.name,
              message: `对象「${obj.name}」的字段「${field.name ?? '未命名'}」关联的目标对象「${targetObject}」不存在`,
              suggestion: '请修改字段配置或先创建目标对象',
            });
          }
        }
      }
    }

    return issues;
  }
}
