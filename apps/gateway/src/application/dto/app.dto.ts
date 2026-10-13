/**
 * 应用 CRUD 请求 DTO — class-based，使 ValidationPipe 和 Swagger 同时生效。
 *
 * 对应 @apaas/shared 中的 CreateAppRequest / UpdateAppRequest / PublishAppRequest interface。
 * Service 层继续使用 interface，Controller 层使用此 class-based DTO。
 */

import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAppDto {
  @ApiPropertyOptional({
    example: 'app_abc123',
    description: 'API 名称（可选，不传则后端自动生成）',
  })
  @IsOptional()
  @IsString()
  apiName?: string;

  @ApiProperty({ example: '客户管理', description: '应用名称' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: '客户管理系统', description: '应用描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'app', description: '图标标识' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ example: '采购业务', description: '应用分组（≤20 字符；空=未分组）' })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: '分组名不能超过 20 个字符' })
  group?: string;

  @ApiPropertyOptional({ example: '#1890ff', description: '主题色' })
  @IsOptional()
  @IsString()
  color?: string;
}

export class UpdateAppDto {
  @ApiPropertyOptional({ example: '客户管理', description: '应用名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '客户管理系统', description: '应用描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'app', description: '图标标识' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ example: '#1890ff', description: '主题色' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: '采购业务', description: '应用分组（≤20 字符；空=未分组）' })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: '分组名不能超过 20 个字符' })
  group?: string;
}

export class UpdateAppGroupDto {
  @ApiProperty({ example: '采购业务', description: '现分组名' })
  @IsString()
  from!: string;

  @ApiPropertyOptional({
    example: '供应链业务',
    description: '新分组名；不传/空串=删除分组（应用移入未分组）',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: '分组名不能超过 20 个字符' })
  to?: string;
}

export class PublishAppDto {
  @ApiProperty({ example: '0.1.0', description: '语义化版本号' })
  @IsString()
  version!: string;

  @ApiProperty({ example: '首次发布', description: '更新说明' })
  @IsString()
  description!: string;
}
