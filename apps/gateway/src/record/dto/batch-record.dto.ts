/**
 * 批量记录操作 DTO — class-based，使 ValidationPipe 和 Swagger 同时生效。
 */

import { ArrayMaxSize, IsArray, IsObject, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BatchCreateDto {
  @ApiProperty({
    description: '记录数据数组（每项为字段键值对）',
    type: 'array',
    items: { type: 'object' },
    example: [{ name: '记录1', status: 'active' }],
  })
  @IsArray()
  @ArrayMaxSize(500)
  records!: Record<string, unknown>[];
}

export class BatchUpdateDto {
  @ApiProperty({
    description: '要更新的记录 ID 列表',
    type: 'array',
    items: { type: 'string' },
    example: ['rec_001', 'rec_002'],
  })
  @IsArray()
  @ArrayMaxSize(500)
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
  })
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  recordIds!: string[];
}
