/**
 * 字段 CRUD 请求 DTO — class-based，使 ValidationPipe 和 Swagger 同时生效。
 *
 * 对应 object.service.ts 中的 CreateFieldInput / UpdateFieldInput interface。
 */

import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFieldDto {
  @ApiProperty({ example: 'phone', description: '字段 API 名称' })
  @IsString()
  apiName!: string;

  @ApiProperty({ example: '手机号', description: '字段显示标签' })
  @IsString()
  label!: string;

  @ApiProperty({ example: 'text', description: '字段类型' })
  @IsString()
  type!: string;

  @ApiPropertyOptional({ description: '字段配置（JSON）' })
  @IsOptional()
  @IsObject()
  config?: unknown;

  @ApiPropertyOptional({ example: false, description: '是否必填' })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ example: false, description: '是否唯一' })
  @IsOptional()
  @IsBoolean()
  unique?: boolean;

  @ApiPropertyOptional({ example: false, description: '是否可搜索' })
  @IsOptional()
  @IsBoolean()
  searchable?: boolean;

  @ApiPropertyOptional({ description: '默认值' })
  @IsOptional()
  defaultValue?: unknown;

  @ApiPropertyOptional({ example: '用户手机号', description: '字段描述' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateFieldDto {
  @ApiPropertyOptional({ example: 'phone', description: '字段 API 名称' })
  @IsOptional()
  @IsString()
  apiName?: string;

  @ApiPropertyOptional({ example: '手机号', description: '字段显示标签' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ example: 'text', description: '字段类型' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: '字段配置（JSON）' })
  @IsOptional()
  @IsObject()
  config?: unknown;

  @ApiPropertyOptional({ example: false, description: '是否必填' })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ example: false, description: '是否唯一' })
  @IsOptional()
  @IsBoolean()
  unique?: boolean;

  @ApiPropertyOptional({ example: false, description: '是否可搜索' })
  @IsOptional()
  @IsBoolean()
  searchable?: boolean;

  @ApiPropertyOptional({ description: '默认值' })
  @IsOptional()
  defaultValue?: unknown;

  @ApiPropertyOptional({ example: '用户手机号', description: '字段描述' })
  @IsOptional()
  @IsString()
  description?: string;
}
