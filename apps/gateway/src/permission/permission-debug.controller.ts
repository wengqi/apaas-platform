/**
 * 权限查询调试 Controller（P1 运维治理）。
 *
 * POST /api/v1/permissions/debug — 仅租户管理员。回答"用户 X 对目标 Y 能否执行 Z、
 * 为什么"：返回有效角色集合、命中规则（含条件/字段域）、deny-overrides 结论、
 * 合并后的行级条件与翻译后的 Prisma where；提供 recordId 时额外以真实查询
 * （count + where）验证该记录在合并条件下是否可见——与运行时同一套代码路径。
 *
 * 不落审计（只读调试），但响应携带 traceId 便于排障串联。
 */

import { Body, Controller, ForbiddenException, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { prisma, Prisma } from '@apaas/db';
import { TenantAdminGuard } from '../auth/tenant-admin.guard.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import { PermissionService } from './permission.service.js';
import { translateCondition } from './condition-translator.js';
import { UntranslatableConditionError } from '../shared/jsonlogic-to-prisma.js';
import { PermissionDebugDto } from './permission-debug.dto.js';

@ApiTags('permission-debug')
@ApiBearerAuth()
@Controller({ path: 'permissions', version: '1' })
@UseGuards(TenantAdminGuard)
export class PermissionDebugController {
  constructor(private readonly permissionService: PermissionService) {}

  @Post('debug')
  @ApiOperation({ summary: '权限决策解释（为什么允许/拒绝，含记录可见性验证）' })
  async debug(@Req() req: AuthenticatedRequest, @Body() dto: PermissionDebugDto) {
    const tenantId = req.user.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('平台超管无租户上下文，无法使用权限调试');
    }

    // 以被调试用户身份解释决策（复用 explain，不改任何运行时语义）
    const subject: AuthenticatedUser = {
      id: dto.userId,
      tenantId,
      email: '',
      roleIds: [],
      roleCodes: [],
      isPlatformAdmin: false,
      // 调试目标是被查用户的规则命中，不短路超管分支
      isSuperAdmin: false,
    };
    const explanation = await this.permissionService.explain(
      subject,
      dto.type,
      dto.action,
      dto.targetId,
      dto.targetNodeId,
    );

    // 行级条件翻译（与 record.service 查询注入同一翻译器；不可翻译原样报告）
    let translatedWhere: unknown = null;
    let translateError: string | null = null;
    if (explanation.mergedCondition !== null && explanation.mergedCondition !== undefined) {
      try {
        translatedWhere = translateCondition(explanation.mergedCondition, {
          currentUser: dto.userId,
        });
      } catch (err) {
        if (err instanceof UntranslatableConditionError) {
          translateError = err.message;
        } else {
          throw err;
        }
      }
    }

    // 记录可见性验证：真实 count({id, AND: where})——与运行时查询同路径的真值
    let recordCheck: { found: boolean; visible: boolean } | null = null;
    if (dto.recordId) {
      const record = await prisma.record.findFirst({
        where: { id: dto.recordId, tenantId },
        select: { id: true, objectId: true },
      });
      if (!record) {
        recordCheck = { found: false, visible: false };
      } else {
        const where = (translatedWhere ?? null) as Prisma.RecordWhereInput | null;
        const visible = await prisma.record.count({
          where: { id: record.id, ...(where ? { AND: where } : {}) },
        });
        recordCheck = { found: true, visible: visible > 0 };
      }
    }

    return {
      ok: true as const,
      data: {
        allowed: explanation.allowed,
        reason: explanation.reason,
        roleIds: explanation.roleIds,
        matchedRules: explanation.matchedRules,
        mergedCondition: explanation.mergedCondition,
        fieldScope: explanation.fieldScope,
        translatedWhere,
        translateError,
        recordCheck,
      },
    };
  }
}
