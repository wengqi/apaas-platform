/**
 * 登录请求 DTO — class-based，使 ValidationPipe 和 Swagger 同时生效。
 *
 * 这是 gateway 中首个 class-based DTO，作为后续模块 DTO 迁移的范式。
 * 原有的 LoginRequest interface 已被此 class 替代。
 */

import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@apaas.dev', description: '用户邮箱' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'admin123', minLength: 6, description: '密码（至少 6 位）' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiPropertyOptional({
    example: 'acme',
    description: '租户标识（slug）。提供=租户用户登录；不提供=平台超管登录',
  })
  @IsOptional()
  @IsString()
  tenantSlug?: string;
}
