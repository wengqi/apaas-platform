/**
 * 流程定义 / 实例 / 通知模版 请求 DTO — class-based，使 ValidationPipe 和 Swagger 同时生效。
 *
 * 对应 process.service.ts 中的 interface 定义。Service 层继续使用 interface。
 */

import { IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProcessDefDto {
  @ApiProperty({ example: 'approval_flow', description: '流程 API 名称' })
  @IsString()
  apiName!: string;

  @ApiProperty({ example: '审批流程', description: '流程显示名称' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Workflow Schema（JSON，流程引擎直接消费）' })
  @IsObject()
  workflowSchema!: unknown;

  @ApiPropertyOptional({ example: 'manual', description: '触发类型' })
  @IsOptional()
  @IsString()
  triggerType?: string;
}

export class UpdateProcessDefDto {
  @ApiPropertyOptional({ example: '审批流程', description: '流程显示名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Workflow Schema（JSON）' })
  @IsOptional()
  @IsObject()
  workflowSchema?: unknown;

  @ApiPropertyOptional({ example: 'manual', description: '触发类型' })
  @IsOptional()
  @IsString()
  triggerType?: string;
}

export class StartInstanceDto {
  @ApiPropertyOptional({ description: '流程变量（键值对）' })
  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'user_xxx', description: '触发用户 ID' })
  @IsOptional()
  @IsString()
  triggeredByUser?: string;
}
