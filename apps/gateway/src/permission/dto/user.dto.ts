/**
 * 用户 请求 DTO — class-based，使 ValidationPipe 和 Swagger 同时生效。
 *
 * 对应 user.controller.ts 中内联的 @Body() 类型。
 */

import { IsArray, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'user@apaas.dev', description: '用户邮箱' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '张三', description: '用户名称' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'password123', minLength: 6, description: '密码（至少 6 位）' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiPropertyOptional({
    example: ['role_xxx'],
    description: '角色 ID 列表',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];

  @ApiPropertyOptional({
    example: ['org_xxx'],
    description: '组织 ID 列表',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  orgIds?: string[];
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: '张三', description: '用户名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'https://avatar.example.com/x.png', description: '头像 URL' })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({ example: 'active', description: '用户状态' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class SetUserRolesDto {
  @ApiProperty({
    example: ['role_xxx', 'role_yyy'],
    description: '角色 ID 列表',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  roleIds!: string[];
}

export class SetUserOrgsDto {
  @ApiProperty({
    example: ['org_xxx', 'org_yyy'],
    description: '组织 ID 列表',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  orgIds!: string[];
}
