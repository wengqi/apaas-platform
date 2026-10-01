/**
 * 开放 API DTO（G6）——外部触发请求合同。
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class StartOpenProcessDto {
  @ApiProperty({
    description: '流程入参（展开到流程变量顶层，供边条件/节点引用）',
    required: false,
  })
  @IsOptional()
  @IsObject()
  inputs?: Record<string, unknown>;

  @ApiProperty({
    description: '业务发起人标识（外部系统的用户/工单号，供通知与审计引用）',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  triggeredByUser?: string;
}
