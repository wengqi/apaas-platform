/**
 * 批量记录操作 DTO — class-based，使 ValidationPipe 和 Swagger 同时生效。
 *
 * 批量上限从环境变量 BATCH_MAX_ROWS 读取（env.validation.ts 定义，默认 500）。
 * DTO 装饰器在类定义时求值，此处直接读 process.env（ConfigService 已通过 Joi 校验）。
 */

import { ArrayMaxSize, IsArray, IsObject, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** 批量操作最大行数（与 env.validation.ts 的 BATCH_MAX_ROWS 一致）。 */
export const BATCH_MAX_ROWS = Number(process.env.BATCH_MAX_ROWS) || 500;

export class BatchCreateDto {
  @ApiProperty({
    description: '记录数据数组（每项为字段键值对）',
    type: 'array',
    items: { type: 'object' },
    example: [{ name: '记录1', status: 'active' }],
    maxItems: BATCH_MAX_ROWS,
  })
  @IsArray()
  @ArrayMaxSize(BATCH_MAX_ROWS)
  records!: Record<string, unknown>[];
}

export class BatchUpdateDto {
  @ApiProperty({
    description: '要更新的记录 ID 列表',
    type: 'array',
    items: { type: 'string' },
    example: ['rec_001', 'rec_002'],
    maxItems: BATCH_MAX_ROWS,
  })
  @IsArray()
  @ArrayMaxSize(BATCH_MAX_ROWS)
  @IsString({ each: true })
  recordIds!: string[];

  @ApiProperty({
    description: '要更新的字段数据（覆盖到所有记录）',
    type: 'object',
    example: { status: 'inactive' },
  })
  @IsObject()
  data!: Record<string, unknown>;
}

export class BatchDeleteDto {
  @ApiProperty({
    description: '要删除的记录 ID 列表',
    type: 'array',
    items: { type: 'string' },
    example: ['rec_001', 'rec_002'],
    maxItems: BATCH_MAX_ROWS,
  })
  @IsArray()
  @ArrayMaxSize(BATCH_MAX_ROWS)
  @IsString({ each: true })
  recordIds!: string[];
}
