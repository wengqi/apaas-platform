/**
 * 审核中心 DTO（R1.2）——请求体/查询参数合同（class-validator + Swagger 共用）。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** 受审模块（R1.2 统一范围） */
export const REVIEW_MODULES = ['OBJECT', 'PAGE', 'PROCESS'] as const;
export type ReviewModuleParam = (typeof REVIEW_MODULES)[number];

/** 提交单状态集合 */
export const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED'] as const;
export type ReviewStatusParam = (typeof REVIEW_STATUSES)[number];

/** 人工提交（把活表当前态固化为基线快照，即时生效） */
export class SubmitResourceDto {
  @ApiProperty({ enum: [...REVIEW_MODULES], description: '资源模块' })
  @IsIn(REVIEW_MODULES as unknown as string[])
  module!: ReviewModuleParam;

  @ApiProperty({ description: '资源活表 ID' })
  @IsString()
  entityId!: string;
}

/** 批准（AI 提交人审通过，快照落活表） */
export class ApproveSubmissionDto {
  @ApiPropertyOptional({ description: '审批意见' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  /** 活表已偏离提交基线时允许强制覆盖（默认拒绝，提示先撤销未提交） */
  @ApiPropertyOptional({ description: '强制覆盖活表漂移', default: false })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

/** 驳回（意见必填，回传给提交者） */
export class RejectSubmissionDto {
  @ApiProperty({ description: '驳回意见（回传提交者）' })
  @IsString()
  @MaxLength(500)
  comment!: string;
}

/** 撤销未提交（把最新基线快照写回活表） */
export class DiscardDraftDto {
  @ApiProperty({ enum: [...REVIEW_MODULES], description: '资源模块' })
  @IsIn(REVIEW_MODULES as unknown as string[])
  module!: ReviewModuleParam;

  @ApiProperty({ description: '资源活表 ID' })
  @IsString()
  entityId!: string;
}

/** 提交单列表筛选 */
export class ListReviewsQueryDto {
  @ApiPropertyOptional({ enum: [...REVIEW_STATUSES], description: '按状态筛选' })
  @IsOptional()
  @IsIn(REVIEW_STATUSES as unknown as string[])
  status?: ReviewStatusParam;

  @ApiPropertyOptional({ enum: [...REVIEW_MODULES], description: '按模块筛选' })
  @IsOptional()
  @IsIn(REVIEW_MODULES as unknown as string[])
  module?: ReviewModuleParam;
}

/** 资源版本链查询 */
export class ResourceVersionsQueryDto {
  @ApiProperty({ enum: [...REVIEW_MODULES], description: '资源模块' })
  @IsIn(REVIEW_MODULES as unknown as string[])
  module!: ReviewModuleParam;

  @ApiProperty({ description: '资源活表 ID' })
  @IsString()
  entityId!: string;
}
