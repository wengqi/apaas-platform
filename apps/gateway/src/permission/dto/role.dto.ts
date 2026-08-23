/**
 * 角色 请求 DTO — class-based，使 ValidationPipe 和 Swagger 同时生效。
 *
 * 对应 role.controller.ts 中内联的 @Body() 类型。
 */

import { IsArray, IsOptional, IsString, IsObject, ArrayNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ example: '管理员', description: '角色名称' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'ADMIN', description: '角色编码' })
  @IsString()
  code!: string;

  @ApiPropertyOptional({ example: '系统管理员', description: '角色描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'app_xxx', description: '应用 ID' })
  @IsOptional()
  @IsString()
  appId?: string;
}

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: '管理员', description: '角色名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '系统管理员', description: '角色描述' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class AssignRoleUsersDto {
  @ApiProperty({
    example: ['user_xxx', 'user_yyy'],
    description: '用户 ID 列表',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  userIds!: string[];
}

export class SetRoleRulesDto {
  @ApiProperty({
    description: '权限规则列表（JSON）',
    example: [{ resource: 'Record', action: 'VIEW', condition: {} }],
    type: 'array',
    items: { type: 'object' },
  })
  @IsArray()
  @IsObject({ each: true })
  rules!: Array<Record<string, unknown>>;
}
