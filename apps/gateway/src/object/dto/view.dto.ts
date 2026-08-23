/**
 * 视图 CRUD 请求 DTO — class-based，使 ValidationPipe 和 Swagger 同时生效。
 *
 * 对应 object.service.ts 中的 CreateViewInput / UpdateViewInput interface。
 */

import { IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateViewDto {
  @ApiProperty({ example: '全部客户', description: '视图名称' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'list', description: '视图类型' })
  @IsString()
  type!: string;

  @ApiPropertyOptional({ description: '视图配置（JSON）' })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class UpdateViewDto {
  @ApiPropertyOptional({ example: '全部客户', description: '视图名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'list', description: '视图类型' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: '视图配置（JSON）' })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
