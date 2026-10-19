/**
 * 流程 API 版本发布管理控制器（G6，JWT 管理面）。
 */
import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { ProcessApiReleaseCreatedDto, ProcessApiReleaseDto } from '@apaas/shared';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import { PermissionGuard } from '../permission/permission.guard.js';
import { DesignAccessGuard } from '../app-access/design-access.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import { ProcessApiReleaseService } from './process-api-release.service.js';

export class ReleaseProcessApiDto {
  @ApiProperty({ description: 'major 版本（首发 1；破坏性变更 +1）' })
  @IsInt()
  @Min(1)
  majorVersion!: number;
}

export class ListReleasesQuery {
  @ApiProperty({ description: '流程定义 ID' })
  @IsString()
  processDefId!: string;
}

@ApiTags('process-api-releases')
@ApiBearerAuth()
@Controller('design/apps')
@UseGuards(PermissionGuard, DesignAccessGuard)
export class ProcessApiReleaseController {
  constructor(private readonly releaseService: ProcessApiReleaseService) {}

  @Post(':appId/processes/:processDefId/api-release')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  @ApiOperation({ summary: '发布流程为开放 API（冻结 schema；破坏性变更请新 major）' })
  async release(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('processDefId') processDefId: string,
    @Body() dto: ReleaseProcessApiDto,
  ): Promise<{ ok: true; data: ProcessApiReleaseCreatedDto }> {
    const data = await this.releaseService.release(
      requireTenantId(req),
      appId,
      processDefId,
      dto.majorVersion,
      req.user.id,
    );
    return { ok: true as const, data };
  }

  @Get(':appId/processes/:processDefId/api-releases')
  @ApiOperation({ summary: '流程 API 版本发布历史' })
  async list(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('processDefId') processDefId: string,
  ): Promise<{ ok: true; data: ProcessApiReleaseDto[] }> {
    const data = await this.releaseService.list(requireTenantId(req), appId, processDefId);
    return { ok: true as const, data };
  }
}
