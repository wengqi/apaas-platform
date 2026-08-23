/**
 * 云函数 CRUD 请求 DTO — class-based，使 ValidationPipe 和 Swagger 同时生效。
 *
 * 对应 @apaas/shared 中的 CreateCloudFunctionRequest / UpdateCloudFunctionRequest /
 * InvokeCloudFunctionRequest interface。Service 层继续使用 interface。
 */

import { IsEnum, IsArray, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  CloudFunctionStatus,
  CloudFunctionCode,
  CloudFunctionInputParam,
} from '@apaas/shared';

export class CreateCloudFunctionDto {
  @ApiProperty({ example: 'calculate_total', description: '云函数 API 名称' })
  @IsString()
  apiName!: string;

  @ApiProperty({ example: '计算总价', description: '云函数名称' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: '根据订单项计算总价', description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '函数代码（JSON）' })
  @IsOptional()
  @IsObject()
  code?: CloudFunctionCode;

  @ApiPropertyOptional({
    description: '输入参数 Schema 数组',
    type: 'array',
    items: { type: 'object' },
  })
  @IsOptional()
  @IsArray()
  inputSchema?: CloudFunctionInputParam[];
}

export class UpdateCloudFunctionDto {
  @ApiPropertyOptional({ example: '计算总价', description: '云函数名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '根据订单项计算总价', description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '函数代码（JSON）' })
  @IsOptional()
  @IsObject()
  code?: CloudFunctionCode;

  @ApiPropertyOptional({
    description: '输入参数 Schema 数组',
    type: 'array',
    items: { type: 'object' },
  })
  @IsOptional()
  @IsArray()
  inputSchema?: CloudFunctionInputParam[];

  @ApiPropertyOptional({
    enum: ['DRAFT', 'PUBLISHED', 'DISABLED'],
    enumName: 'CloudFunctionStatus',
    example: 'PUBLISHED',
    description: '云函数状态',
  })
  @IsOptional()
  @IsEnum(['DRAFT', 'PUBLISHED', 'DISABLED'] satisfies readonly CloudFunctionStatus[])
  status?: CloudFunctionStatus;
}

export class InvokeCloudFunctionDto {
  @ApiPropertyOptional({ description: '输入参数（键值对）' })
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;
}
