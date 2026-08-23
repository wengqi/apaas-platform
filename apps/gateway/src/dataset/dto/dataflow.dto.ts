/**
 * 数据流 CRUD 请求 DTO — class-based，使 ValidationPipe 和 Swagger 同时生效。
 *
 * 对应 @apaas/shared 中的 CreateDataFlowRequest / UpdateDataFlowRequest interface。
 * Service 层继续使用 interface。
 */

import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { DataFlowStatus, DataFlowConfig } from '@apaas/shared';

export class CreateDataFlowDto {
  @ApiProperty({ example: 'customer_metrics', description: '数据流 API 名称' })
  @IsString()
  apiName!: string;

  @ApiProperty({ example: '客户指标数据流', description: '数据流名称' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: '从客户对象聚合指标', description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: '数据流配置（JSON）' })
  @IsObject()
  config!: DataFlowConfig;
}

export class UpdateDataFlowDto {
  @ApiPropertyOptional({ example: '客户指标数据流', description: '数据流名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '从客户对象聚合指标', description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '数据流配置（JSON）' })
  @IsOptional()
  @IsObject()
  config?: DataFlowConfig;

  @ApiPropertyOptional({
    enum: ['DRAFT', 'ACTIVE'],
    enumName: 'DataFlowStatus',
    example: 'ACTIVE',
    description: '数据流状态',
  })
  @IsOptional()
  @IsEnum(['DRAFT', 'ACTIVE'] satisfies readonly DataFlowStatus[])
  status?: DataFlowStatus;
}
