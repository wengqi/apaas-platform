/**
 * 审核中心控制器（R1.2）——提交单审批与资源版本链查询。
 *
 * 批/驳权限 v1 沿用应用发布权限（PAGE/MANAGE @ appId）：审核者 = 可发布者。
 * 路由声明顺序注意：字面量段（dirty/versions）必须先于 :submissionId 参数段。
 */

import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  DirtyResourceDto,
  ResourceSnapshot,
  ResourceVersionDetailDto,
  ResourceVersionDto,
  ResourceVersionListItemDto,
} from '@apaas/shared';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { requireTenantId } from '../auth/tenant-context.js';
import { PermissionGuard } from '../permission/permission.guard.js';
import { RequirePermission } from '../permission/require-permission.decorator.js';
import { ReviewService } from './review.service.js';
import {
  AdoptDraftEditDto,
  ApproveSubmissionDto,
  DiscardDraftDto,
  ListReviewsQueryDto,
  RejectSubmissionDto,
  ResourceVersionsQueryDto,
  SubmitResourceDto,
} from './review.dto.js';

@ApiTags('reviews')
@ApiBearerAuth()
@Controller('design/apps')
@UseGuards(PermissionGuard)
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  // ---------------------------------------------------------------------------
  // 查询（字面量段在前，避免被 :submissionId 吞掉）
  // ---------------------------------------------------------------------------

  @Get('reviews/pending-summary')
  @ApiOperation({ summary: '租户级待审汇总（按应用聚合 PENDING，素蓝首页数据源）' })
  async pendingSummary(@Req() req: AuthenticatedRequest): Promise<{
    ok: true;
    data: {
      total: number;
      items: Array<{
        appId: string;
        appName: string;
        count: number;
        latest: { module: string; apiName: string; name: string; createdAt: Date } | null;
      }>;
    };
  }> {
    const data = await this.reviewService.pendingSummary(requireTenantId(req));
    return { ok: true as const, data };
  }

  @Get(':appId/reviews/dirty')
  @ApiOperation({ summary: '脏资源清单：活表 ≠ 最新基线快照（可撤销未提交）' })
  async listDirty(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
  ): Promise<{ ok: true; data: DirtyResourceDto[] }> {
    const dirty = await this.reviewService.listDirtyResources(requireTenantId(req), appId);
    return { ok: true as const, data: dirty };
  }

  @Get(':appId/reviews/versions')
  @ApiOperation({ summary: '资源版本链（历史提交）' })
  async listVersions(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Query() query: ResourceVersionsQueryDto,
  ): Promise<{ ok: true; data: ResourceVersionDto[] }> {
    const versions = await this.reviewService.listResourceVersions(
      requireTenantId(req),
      appId,
      query.module,
      query.entityId,
    );
    return { ok: true as const, data: versions };
  }

  @Get(':appId/reviews')
  @ApiOperation({ summary: '提交单列表（PENDING 单附 diff 摘要）' })
  async list(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Query() query: ListReviewsQueryDto,
  ): Promise<{ ok: true; data: ResourceVersionListItemDto[] }> {
    const items = await this.reviewService.listSubmissions(requireTenantId(req), appId, query);
    return { ok: true as const, data: items };
  }

  @Get(':appId/reviews/:submissionId')
  @ApiOperation({ summary: '提交单详情（含快照与完整 diff）' })
  async get(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('submissionId') submissionId: string,
  ): Promise<{ ok: true; data: ResourceVersionDetailDto }> {
    const detail = await this.reviewService.getSubmission(
      requireTenantId(req),
      appId,
      submissionId,
    );
    return { ok: true as const, data: detail };
  }

  // ---------------------------------------------------------------------------
  // 提交与审批
  // ---------------------------------------------------------------------------

  @Post(':appId/reviews/submit')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  @ApiOperation({ summary: '人工提交：固化活表当前态为基线快照（即时生效）' })
  async submit(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() dto: SubmitResourceDto,
  ): Promise<{ ok: true; data: ResourceVersionDto }> {
    const version = await this.reviewService.submitHuman(
      requireTenantId(req),
      appId,
      dto.module,
      dto.entityId,
      req.user.id,
    );
    return { ok: true as const, data: version };
  }

  @Post(':appId/reviews/discard')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  @ApiOperation({ summary: '撤销未提交：把最新基线快照写回活表' })
  async discard(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Body() dto: DiscardDraftDto,
  ): Promise<{ ok: true; data: { reverted: boolean; apiName: string } }> {
    const result = await this.reviewService.discardDraft(
      requireTenantId(req),
      appId,
      dto.module,
      dto.entityId,
      req.user.id,
    );
    return { ok: true as const, data: result };
  }

  @Post(':appId/reviews/batch/:batchId/approve')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  @ApiOperation({ summary: '批量批准：对象→页面→流程拓扑序落地并解析 @ref: 引用令牌' })
  async approveBatch(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('batchId') batchId: string,
    @Body() dto: ApproveSubmissionDto,
  ): Promise<{ ok: true; data: ResourceVersionDto[] }> {
    const versions = await this.reviewService.approveBatch(
      requireTenantId(req),
      appId,
      batchId,
      req.user.id,
      dto,
    );
    return { ok: true as const, data: versions };
  }

  @Post(':appId/reviews/batch/:batchId/reject')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  @ApiOperation({ summary: '批量驳回：批次内全部待审单级联驳回' })
  async rejectBatch(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('batchId') batchId: string,
    @Body() dto: RejectSubmissionDto,
  ): Promise<{ ok: true; data: { rejected: number } }> {
    const result = await this.reviewService.rejectBatch(
      requireTenantId(req),
      appId,
      batchId,
      req.user.id,
      dto.comment,
    );
    return { ok: true as const, data: result };
  }

  @Post(':appId/reviews/:submissionId/approve')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  @ApiOperation({ summary: '批准：快照落活表（活表偏离基线时需 force）' })
  async approve(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('submissionId') submissionId: string,
    @Body() dto: ApproveSubmissionDto,
  ): Promise<{ ok: true; data: ResourceVersionDto }> {
    const version = await this.reviewService.approve(
      requireTenantId(req),
      appId,
      submissionId,
      req.user.id,
      dto,
    );
    return { ok: true as const, data: version };
  }

  @Post(':appId/reviews/:submissionId/reject')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  @ApiOperation({ summary: '驳回：意见回传提交者' })
  async reject(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('submissionId') submissionId: string,
    @Body() dto: RejectSubmissionDto,
  ): Promise<{ ok: true; data: ResourceVersionDto }> {
    const version = await this.reviewService.reject(
      requireTenantId(req),
      appId,
      submissionId,
      req.user.id,
      dto.comment,
    );
    return { ok: true as const, data: version };
  }

  @Post(':appId/reviews/:submissionId/adopt')
  @RequirePermission('PAGE', 'MANAGE', 'appId')
  @ApiOperation({
    summary: '改稿收编：人工编辑后的 AI 草稿直接落地为人工基线（原草稿记为已取代）',
  })
  async adoptEdit(
    @Req() req: AuthenticatedRequest,
    @Param('appId') appId: string,
    @Param('submissionId') submissionId: string,
    @Body() dto: AdoptDraftEditDto,
  ): Promise<{ ok: true; data: ResourceVersionDto }> {
    const version = await this.reviewService.adoptDraftEdit(
      requireTenantId(req),
      appId,
      submissionId,
      req.user.id,
      dto.snapshot as unknown as ResourceSnapshot,
      { comment: dto.comment },
    );
    return { ok: true as const, data: version };
  }
}
