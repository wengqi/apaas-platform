/**
 * 开放 API 控制器（G6）——外部系统以 X-API-Key 触发纯流程。
 *
 * 路由：/api/v1/open/...（不挂 JWT/PermissionGuard；ApiKeyGuard + open 限流桶）。
 * 契约承诺：钉版本的调用执行该 major 冻结的 workflowSchema，
 * 后续发布不改变已发布 major 的行为（旧 major 置 DEPRECATED 仍可调）。
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { OpenApiProcessDto, OpenApiStartResult } from '@apaas/shared';
import { runWithTenant } from '@apaas/db';
import type { ServiceIdentityUser } from '../service-identity/api-key.service.js';
import { ApiKeyGuard } from '../service-identity/api-key.guard.js';
import { writeAudit } from '../common/audit.js';
import { ProcessEngine } from '../process/process-engine.js';
import { ProcessApiReleaseService } from './process-api-release.service.js';
import { StartOpenProcessDto } from './open-api.dto.js';

/** open 限流桶参数（THROTTLE_OPEN_LIMIT 可覆盖） */
const OPEN_TTL = Number(process.env.THROTTLE_TTL_MS) || 60_000;
const OPEN_LIMIT = Number(process.env.THROTTLE_OPEN_LIMIT) || 120;

@ApiTags('open')
@Controller('open')
@UseGuards(ApiKeyGuard)
@Throttle({ open: { ttl: OPEN_TTL, limit: OPEN_LIMIT } })
export class OpenApiController {
  constructor(
    private readonly releaseService: ProcessApiReleaseService,
    private readonly engine: ProcessEngine,
  ) {}

  /** 可调用流程发现（最新 major 与触发地址）。 */
  @Get('apps/:appId/processes')
  async listProcesses(
    @Req() req: Request & { user?: ServiceIdentityUser },
    @Param('appId') appId: string,
  ): Promise<{ ok: true; data: OpenApiProcessDto[] }> {
    const tenantId = req.user!.tenantId;
    return runWithTenant(tenantId, async () => {
      const releases = await this.releaseService.listByApp(tenantId, appId);
      const byApiName = new Map<string, typeof releases>();
      for (const r of releases) {
        const list = byApiName.get(r.apiName) ?? [];
        list.push(r);
        byApiName.set(r.apiName, list);
      }
      const data: OpenApiProcessDto[] = [];
      for (const [apiName, list] of byApiName) {
        // 最新 major 优先 ACTIVE；冻结 schema 内含流程名
        const latest =
          list.find((r) => r.status === 'ACTIVE') ??
          [...list].sort((a, b) => b.majorVersion - a.majorVersion)[0]!;
        const frozen = latest.workflowSchema as { name?: string };
        data.push({
          apiName,
          name: frozen.name ?? apiName,
          latestMajor: latest.majorVersion,
          triggerUrl: `/api/v1/open/apps/${appId}/processes/${apiName}/start`,
        });
      }
      return { ok: true as const, data };
    });
  }

  /** 触发最新 ACTIVE 版本。 */
  @Post('apps/:appId/processes/:apiName/start')
  async startLatest(
    @Req() req: Request & { user?: ServiceIdentityUser },
    @Param('appId') appId: string,
    @Param('apiName') apiName: string,
    @Body() dto: StartOpenProcessDto,
  ): Promise<{ ok: true; data: OpenApiStartResult }> {
    return this.start(req, appId, apiName, undefined, dto);
  }

  /** 触发钉定 major（版本稳定性承诺：执行该 major 冻结的 schema）。 */
  @Post('apps/:appId/processes/:apiName/major/:major/start')
  async startPinned(
    @Req() req: Request & { user?: ServiceIdentityUser },
    @Param('appId') appId: string,
    @Param('apiName') apiName: string,
    @Param('major') major: string,
    @Body() dto: StartOpenProcessDto,
  ): Promise<{ ok: true; data: OpenApiStartResult }> {
    const majorVersion = Number(major);
    if (!Number.isInteger(majorVersion) || majorVersion < 1) {
      throw new BadRequestException(`非法 major 版本: ${major}`);
    }
    return this.start(req, appId, apiName, majorVersion, dto);
  }

  private async start(
    req: Request & { user?: ServiceIdentityUser },
    appId: string,
    apiName: string,
    majorVersion: number | undefined,
    dto: StartOpenProcessDto,
  ): Promise<{ ok: true; data: OpenApiStartResult }> {
    const identity = req.user!;
    const tenantId = identity.tenantId;

    return runWithTenant(tenantId, async () => {
      const release = await this.releaseService.resolve(tenantId, appId, apiName, majorVersion);
      const frozen = release.workflowSchema as { workflowSchema: Record<string, unknown> };

      const instanceId = await this.engine.startProcess(
        tenantId,
        release.processDefId,
        {
          triggerType: 'API',
          triggeredBy: 'API',
          triggeredByUser: dto.triggeredByUser ?? null,
          serviceIdentityId: identity.serviceIdentityId,
          apiName,
          inputs: dto.inputs ?? {},
        },
        undefined, // env：ALS（拦截器已按 ?env= 解析）
        frozen.workflowSchema, // schemaOverride：钉版本契约直通
      );

      // 审计：inputs 只记键名不记值（脱敏）
      writeAudit({
        tenantId,
        userId: identity.serviceIdentityId,
        action: 'PROCESS_API_START',
        resource: 'PROCESS',
        resourceId: release.processDefId,
        appId,
        detail: {
          apiName,
          majorVersion: release.majorVersion,
          inputKeys: Object.keys(dto.inputs ?? {}),
        },
      });

      return {
        ok: true as const,
        data: {
          instanceId,
          processApiName: apiName,
          majorVersion: release.majorVersion,
          status: 'RUNNING',
        },
      };
    });
  }
}
