/**
 * 流程 API 版本发布服务（G6 版本稳定性承诺）。
 *
 * 语义：apiName+major → 冻结 workflowSchema 快照，发布后永不修改。
 * - 首发 major=1；后续新 major 必须显式指定（对上一 major 快照跑
 *   diffProcessResource 返回结构化 diff——破坏性变更半自动）
 * - 新 major 发布后旧 major 自动置 DEPRECATED（仍可调用——承诺本体）
 * - 活表流程必须 PUBLISHED 且 triggerType=API 才可发布
 */

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@apaas/db';
import type {
  ProcessApiReleaseCreatedDto,
  ProcessApiReleaseDto,
  ResourceDiff,
} from '@apaas/shared';
import { diffProcessResource } from '@apaas/shared';
import type { ProcessResourceSnapshot } from '@apaas/shared';
import { writeAudit } from '../common/audit.js';

@Injectable()
export class ProcessApiReleaseService {
  /** 发布新 major：冻结当前已发布流程 schema。 */
  async release(
    tenantId: string,
    appId: string,
    processDefId: string,
    majorVersion: number,
    userId: string,
  ): Promise<ProcessApiReleaseCreatedDto> {
    if (!Number.isInteger(majorVersion) || majorVersion < 1) {
      throw new BadRequestException('majorVersion 必须为正整数');
    }

    const def = await prisma.processDef.findFirst({
      where: { id: processDefId, tenantId, appId },
    });
    if (!def) throw new NotFoundException('流程不存在');
    if (def.status !== 'PUBLISHED') {
      throw new BadRequestException('流程须先发布（PUBLISHED）才能发布为 API');
    }
    if (def.triggerType !== 'API') {
      throw new BadRequestException('仅 API 触发类型的流程可发布为开放 API');
    }

    const dup = await prisma.processApiRelease.findFirst({
      where: { appId, apiName: def.apiName, majorVersion },
    });
    if (dup) {
      throw new BadRequestException(
        `v${majorVersion} 已存在（发布后不可覆盖，破坏性变更请新增 major）`,
      );
    }

    const previous = await prisma.processApiRelease.findFirst({
      where: { appId, apiName: def.apiName },
      orderBy: { majorVersion: 'desc' },
    });

    // 与上一 major 的结构化 diff（破坏性变更半自动：开发者过目后显式选 major）
    let diff: ResourceDiff | null = null;
    if (previous) {
      const baseline = previous.workflowSchema as unknown as ProcessResourceSnapshot;
      const submitted: ProcessResourceSnapshot = {
        apiName: def.apiName,
        name: def.name,
        workflowSchema: def.workflowSchema as Record<string, unknown>,
        triggerType: def.triggerType,
        cron: def.cron,
      };
      diff = diffProcessResource(baseline, submitted);
    }

    const release = await prisma.$transaction(async (tx) => {
      // 旧 major 全部置 DEPRECATED（仍可调用）
      await tx.processApiRelease.updateMany({
        where: { appId, apiName: def.apiName, status: 'ACTIVE' },
        data: { status: 'DEPRECATED' },
      });
      return tx.processApiRelease.create({
        data: {
          tenantId,
          appId,
          processDefId: def.id,
          apiName: def.apiName,
          majorVersion,
          workflowSchema: {
            apiName: def.apiName,
            name: def.name,
            workflowSchema: def.workflowSchema,
            triggerType: def.triggerType ?? 'API',
            cron: def.cron,
          } as object,
          triggerType: def.triggerType ?? 'API',
          releasedBy: userId,
        },
      });
    });

    writeAudit({
      tenantId,
      userId,
      action: 'PROCESS_API_RELEASE',
      resource: 'PROCESS',
      resourceId: release.id,
      appId,
      detail: { apiName: def.apiName, majorVersion, diffCount: diff?.changeCount ?? 0 },
    });

    return {
      ...this.toDto(release),
      diff,
      deprecatedMajors: previous ? [previous.majorVersion] : [],
    };
  }

  /** 应用下全部流程 API 发布（开放发现用；含 DEPRECATED）。 */
  async listByApp(tenantId: string, appId: string) {
    return prisma.processApiRelease.findMany({
      where: { tenantId, appId },
      orderBy: { majorVersion: 'desc' },
    });
  }

  /** 按流程列版本发布历史。 */
  async list(
    tenantId: string,
    appId: string,
    processDefId: string,
  ): Promise<ProcessApiReleaseDto[]> {
    const rows = await prisma.processApiRelease.findMany({
      where: { tenantId, appId, processDefId },
      orderBy: { majorVersion: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  /** 解析调用目标：钉 major 精确匹配；未钉取最新 ACTIVE。 */
  async resolve(tenantId: string, appId: string, apiName: string, majorVersion?: number) {
    const release = majorVersion
      ? await prisma.processApiRelease.findFirst({
          where: { tenantId, appId, apiName, majorVersion },
        })
      : await prisma.processApiRelease.findFirst({
          where: { tenantId, appId, apiName, status: 'ACTIVE' },
          orderBy: { majorVersion: 'desc' },
        });
    if (!release)
      throw new NotFoundException(
        `流程 API 不存在: ${apiName}${majorVersion ? `@v${majorVersion}` : ''}`,
      );
    return release;
  }

  private toDto(row: {
    id: string;
    appId: string;
    processDefId: string;
    apiName: string;
    majorVersion: number;
    status: string;
    triggerType: string;
    releasedBy: string;
    createdAt: Date;
  }): ProcessApiReleaseDto {
    return {
      id: row.id,
      appId: row.appId,
      processDefId: row.processDefId,
      apiName: row.apiName,
      majorVersion: row.majorVersion,
      status: row.status as ProcessApiReleaseDto['status'],
      triggerType: row.triggerType,
      releasedBy: row.releasedBy,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
