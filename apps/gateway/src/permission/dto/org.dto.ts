/**
 * 组织 请求 DTO — class-based，使 ValidationPipe 和 Swagger 同时生效。
 *
 * 对应 org.controller.ts 中内联的 @Body() 类型。
 */

import { IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrgDto {
  @ApiPropertyOptional({ example: 'org_root', description: '父节点 ID' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiProperty({ example: '华东大区', description: '节点名称' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'EAST_CHINA', description: '节点编码' })
  @IsString()
  code!: string;

  @ApiPropertyOptional({ example: 'department', description: '节点类型' })
  @IsOptional()
  @IsString()
  nodeType?: string;

  @ApiPropertyOptional({ example: 1, description: '排序' })
  @IsOptional()
  @IsNumber()
  sort?: number;
}

export class UpdateOrgDto {
  @ApiPropertyOptional({ example: '华东大区', description: '节点名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 1, description: '排序' })
  @IsOptional()
  @IsNumber()
  sort?: number;

  @ApiPropertyOptional({ example: 'org_root', description: '父节点 ID' })
  @IsOptional()
  @IsString()
  parentId?: string;
}

export class MoveOrgDto {
  @ApiProperty({ example: 'org_root', description: '目标父节点 ID' })
  @IsString()
  parentId!: string;
}

export class AddOrgMemberDto {
  @ApiProperty({ example: 'user_xxx', description: '用户 ID' })
  @IsString()
  userId!: string;
}

export class GrantOrgRoleDto {
  @ApiProperty({ example: 'role_xxx', description: '角色 ID' })
  @IsString()
  roleId!: string;

  @ApiPropertyOptional({ example: 'app_xxx', description: '应用 ID' })
  @IsOptional()
  @IsString()
  appId?: string;
}
