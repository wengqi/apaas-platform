/**
 * 人工任务 请求 DTO — class-based，使 ValidationPipe 和 Swagger 同时生效。
 *
 * 对应 process.controller.ts 中内联的 @Body() 类型。
 */

import { IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CompleteTaskDto {
  @ApiProperty({ example: 'approve', description: '审批决定（approve/reject）' })
  @IsString()
  decision!: string;

  @ApiPropertyOptional({ example: '同意', description: '审批意见' })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ description: '表单数据（键值对）' })
  @IsOptional()
  @IsObject()
  formData?: Record<string, unknown>;
}

export class DelegateTaskDto {
  @ApiProperty({ example: 'user_xxx', description: '被转办人用户 ID' })
  @IsString()
  delegatedTo!: string;
}
