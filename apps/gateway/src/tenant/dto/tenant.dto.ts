/**
 * 租户 请求 DTO — class-based，使 ValidationPipe 和 Swagger 同时生效。
 *
 * 对应 tenant.controller.ts 中内联的 @Body() 类型。
 */

import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTenantDto {
  @ApiProperty({ example: 'Acme 公司', description: '租户名称' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'acme', description: '租户标识（slug）' })
  @IsString()
  slug!: string;

  @ApiPropertyOptional({ example: 'Acme 公司租户', description: '租户描述' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateTenantDto {
  @ApiPropertyOptional({ example: 'Acme 公司', description: '租户名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Acme 公司租户', description: '租户描述' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class AssignTenantAdminDto {
  @ApiProperty({ example: 'admin@acme.dev', description: '管理员邮箱' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '管理员', description: '管理员名称' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'admin123', minLength: 6, description: '密码（至少 6 位）' })
  @IsString()
  @MinLength(6)
  password!: string;
}
