/**
 * 通知模版 请求 DTO — class-based，使 ValidationPipe 和 Swagger 同时生效。
 *
 * 对应 process.service.ts 中的 CreateTemplateRequest / UpdateTemplateRequest interface。
 */

import { IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTemplateDto {
  @ApiProperty({ example: '审批通知', description: '模版名称' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'email', description: '通知渠道' })
  @IsString()
  channel!: string;

  @ApiProperty({ example: '您有一条待审批任务', description: '标题模版' })
  @IsString()
  titleTemplate!: string;

  @ApiProperty({ example: '请尽快处理：{{taskName}}', description: '正文模版' })
  @IsString()
  bodyTemplate!: string;

  @ApiPropertyOptional({ description: '变量定义（JSON）' })
  @IsOptional()
  @IsObject()
  variables?: unknown;
}

export class UpdateTemplateDto {
  @ApiPropertyOptional({ example: '审批通知', description: '模版名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'email', description: '通知渠道' })
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiPropertyOptional({ example: '您有一条待审批任务', description: '标题模版' })
  @IsOptional()
  @IsString()
  titleTemplate?: string;

  @ApiPropertyOptional({ example: '请尽快处理：{{taskName}}', description: '正文模版' })
  @IsOptional()
  @IsString()
  bodyTemplate?: string;

  @ApiPropertyOptional({ description: '变量定义（JSON）' })
  @IsOptional()
  @IsObject()
  variables?: unknown;
}
