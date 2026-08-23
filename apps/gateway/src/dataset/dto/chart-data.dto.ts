/**
 * 图表数据聚合 请求 DTO — class-based，使 ValidationPipe 和 Swagger 同时生效。
 *
 * 对应 chart-data.service.ts 中的 ChartDataRequest interface。
 * Service 层继续使用 interface。
 */

import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ChartAggregation, TimeGranularity } from '@apaas/shared';

export class ChartDataDto {
  @ApiProperty({
    enum: ['object', 'dataset'],
    example: 'object',
    description: '数据源类型',
  })
  @IsEnum(['object', 'dataset'])
  sourceType!: 'object' | 'dataset';

  @ApiProperty({ example: 'obj_xxx', description: '数据源 ID（对象 ID 或数据集 ID）' })
  @IsString()
  sourceId!: string;

  @ApiPropertyOptional({
    example: 'status',
    description: '分类字段名（分组依据）。省略时返回标量聚合值（指标卡用）',
  })
  @IsOptional()
  @IsString()
  categoryField?: string;

  @ApiPropertyOptional({
    example: 'amount',
    description: '值字段名（聚合对象）。count 聚合时可省略',
  })
  @IsOptional()
  @IsString()
  valueField?: string;

  @ApiProperty({
    enum: ['sum', 'count', 'avg', 'max', 'min'],
    enumName: 'ChartAggregation',
    example: 'sum',
    description: '聚合函数',
  })
  @IsEnum(['sum', 'count', 'avg', 'max', 'min'] satisfies readonly ChartAggregation[])
  aggregation!: ChartAggregation;

  @ApiPropertyOptional({ description: '筛选条件（JsonLogic JSON）' })
  @IsOptional()
  @IsObject()
  filter?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    enum: ['day', 'week', 'month'],
    enumName: 'TimeGranularity',
    example: 'day',
    description: '时间分桶粒度（当 categoryField 为日期字段时使用）',
  })
  @IsOptional()
  @IsEnum(['day', 'week', 'month'] satisfies readonly TimeGranularity[])
  timeGranularity?: TimeGranularity;
}
