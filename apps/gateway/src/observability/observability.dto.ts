/**
 * 观测事件 DTO（P1 运维治理）——页面报错上报请求合同。
 *
 * 上报方为 runtime-ui 的 GlobalErrorBoundary（浏览器异常兜底），字段全部
 * 有长度上限：服务端入库前不信任客户端任何内容（截断即脱敏）。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const MESSAGE_MAX_LENGTH = 500;
const STACK_MAX_LENGTH = 4000;
const HREF_MAX_LENGTH = 500;
const COMPONENT_STACK_MAX_LENGTH = 2000;
const APP_ID_MAX_LENGTH = 64;

export class ReportPageErrorDto {
  @ApiProperty({ description: '异常消息（截断到 500 字符）' })
  @IsString()
  @MaxLength(MESSAGE_MAX_LENGTH)
  message!: string;

  @ApiPropertyOptional({ description: '异常堆栈（截断到 4000 字符）' })
  @IsOptional()
  @IsString()
  @MaxLength(STACK_MAX_LENGTH)
  stack?: string;

  @ApiPropertyOptional({ description: '报错页面 URL（截断到 500 字符）' })
  @IsOptional()
  @IsString()
  @MaxLength(HREF_MAX_LENGTH)
  href?: string;

  @ApiPropertyOptional({ description: 'React 组件栈（截断到 2000 字符）' })
  @IsOptional()
  @IsString()
  @MaxLength(COMPONENT_STACK_MAX_LENGTH)
  componentStack?: string;

  @ApiPropertyOptional({ description: '应用 ID（应用内页面报错时携带）' })
  @IsOptional()
  @IsString()
  @MaxLength(APP_ID_MAX_LENGTH)
  appId?: string;
}
