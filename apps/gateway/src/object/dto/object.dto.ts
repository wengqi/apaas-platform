/**
 * 对象 CRUD 请求 DTO — class-based，使 ValidationPipe 和 Swagger 同时生效。
 *
 * 对应 object.service.ts 中的 CreateObjectInput / UpdateObjectInput interface。
 * Service 层继续使用 interface，Controller 层使用此 class-based DTO。
 */

import { IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateObjectDto {
  @ApiProperty({ example: 'Customer', description: '对象 API 名称' })
  @IsString()
  apiName!: string;

  @ApiProperty({ example: '客户', description: '对象显示名称' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: '客户对象', description: '对象描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'bank', description: '图标标识' })
  @IsOptional()
  @IsString()
  icon?: string;
}

export class UpdateObjectDto {
  @ApiPropertyOptional({ example: '客户', description: '对象显示名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '客户对象', description: '对象描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'bank', description: '图标标识' })
  @IsOptional()
  @IsString()
  icon?: string;
}
