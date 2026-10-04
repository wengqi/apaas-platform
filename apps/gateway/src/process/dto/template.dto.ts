/**
 * 通知模版 请求 DTO — class-based，使 ValidationPipe 和 Swagger 同时生效。
 *
 * 对应 process.service.ts 中的 CreateTemplateRequest / UpdateTemplateRequest interface。
 *
 * variables 契约（交互评审 2026-10-04 修复）：变量定义是 UI 元数据数组
 * （[{name, description, sampleValue}]，驱动搭建器的"插入变量/预览"），
 * 发送侧渲染只用实例变量（renderTemplateDotted(scope)），不读该字段。
 * 此前 @IsObject() 与 service 默认值 []（数组）及 studio 载荷自相矛盾——
 * UI 创建模版必然 400"variables must be an object"。
 */

import { IsArray, IsOptional, IsString } from 'class-validator';
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

  @ApiPropertyOptional({
    example: [{ name: 'result', description: '审批结果', sampleValue: '通过' }],
    description: '变量定义（数组，UI 元数据）',
  })
  @IsOptional()
  @IsArray()
  variables?: unknown[];
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

  @ApiPropertyOptional({ description: '变量定义（数组，UI 元数据）' })
  @IsOptional()
  @IsArray()
  variables?: unknown[];
}
