/**
 * 页面 CRUD 请求 DTO — class-based，使 ValidationPipe 和 Swagger 同时生效。
 *
 * 对应 @apaas/shared 中的 CreatePageRequest / UpdatePageRequest interface。
 * Service 层继续使用 interface，Controller 层使用此 class-based DTO。
 */

import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PageType, type PageSchema } from '@apaas/shared';

export class CreatePageDto {
  @ApiProperty({ example: 'customer_list', description: '页面 API 名称（应用内唯一）' })
  @IsString()
  apiName!: string;

  @ApiProperty({ example: '客户列表', description: '显示名称' })
  @IsString()
  name!: string;

  @ApiProperty({
    enum: PageType,
    enumName: 'PageType',
    example: PageType.ListPage,
    description: '页面类型',
  })
  @IsEnum(PageType)
  type!: PageType;

  @ApiPropertyOptional({ example: 'obj_xxx', description: '关联对象 ID' })
  @IsOptional()
  @IsString()
  objectId?: string;

  @ApiPropertyOptional({ description: '页面 Schema（JSON）' })
  @IsOptional()
  @IsObject()
  schema?: PageSchema;
}

export class UpdatePageDto {
  @ApiPropertyOptional({ example: '客户列表', description: '显示名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '页面 Schema（JSON）' })
  @IsOptional()
  @IsObject()
  schema?: PageSchema;

  @ApiPropertyOptional({ example: true, description: '发布状态' })
  @IsOptional()
  isPublished?: boolean;
}
