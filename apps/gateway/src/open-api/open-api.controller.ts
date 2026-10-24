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
  ForbiddenException,
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
import { ObservabilityService } from '../observability/observability.service.js';
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
    private readonly observabilityService: ObservabilityService,
    private readonly engine: ProcessEngine,
  ) {}

  /**
   * 服务身份应用作用域（对抗审查 security-03）：按应用发放的 key 只能访问绑定应用的
   * 开放 API——管理面签发/门控都按 appId，数据面此前只消费 tenantId，绑定沦为装饰。
   * appId=null（租户级身份）不限制。
   */
  private assertAppScope(identity: ServiceIdentityUser, appId: string): void {
    if (identity.appId !== null && identity.appId !== appId) {
      throw new ForbiddenException(
        `服务身份绑定应用 ${identity.appId}，无权访问应用 ${appId} 的开放 API`,
      );
    }
  }

  /** 可调用流程发现（最新 major 与触发地址）。 */
  @Get('apps/:appId/processes')
  async listProcesses(
    @Req() req: Request & { user?: ServiceIdentityUser },
    @Param('appId') appId: string,
  ): Promise<{ ok: true; data: OpenApiProcessDto[] }> {
    const tenantId = req.user!.tenantId;
    this.assertAppScope(req.user!, appId);
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
    this.assertAppScope(identity, appId);

    return runWithTenant(tenantId, async () => {
      const release = await this.releaseService.resolve(tenantId, appId, apiName, majorVersion);
      const frozen = release.workflowSchema as { workflowSchema: Record<string, unknown> };

      // 观测事件（P1 运维治理）：OPEN_API_CALL——外部触发的耗时与成败分类落库
      const startAt = Date.now();
      let instanceId: string;
      try {
        instanceId = await this.engine.startProcess(
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
      } catch (err) {
        void this.observabilityService
          .record({
            tenantId,
            appId,
            category: 'OPEN_API_CALL',
            level: 'ERROR',
            source: 'open-api:start',
            resourceId: release.processDefId,
            message: `开放 API ${apiName}（major ${release.majorVersion}）触发失败：${err instanceof Error ? err.message : String(err)}`,
            durationMs: Date.now() - startAt,
            detail: {
              apiName,
              majorVersion: release.majorVersion,
              inputKeys: Object.keys(dto.inputs ?? {}),
            },
          })
          .catch(() => undefined);
        throw err;
      }
      void this.observabilityService
        .record({
          tenantId,
          appId,
          category: 'OPEN_API_CALL',
          source: 'open-api:start',
          resourceId: release.processDefId,
          message: `开放 API ${apiName}（major ${release.majorVersion}）触发成功，实例 ${instanceId}`,
          durationMs: Date.now() - startAt,
          detail: {
            apiName,
            majorVersion: release.majorVersion,
            instanceId,
            inputKeys: Object.keys(dto.inputs ?? {}),
          },
        })
        .catch(() => undefined);

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
