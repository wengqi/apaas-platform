/**
 * 权限调试 DTO（P1 运维治理）——权限查询调试工具请求合同。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** 权限类型值域（PermissionRule.type）。 */
export const PERMISSION_TARGET_TYPES = [
  'PAGE',
  'RECORD',
  'PROCESS',
  'DATA_MODEL',
  'CONNECTOR',
] as const;
/** 权限动作值域（PermissionRule.action）。 */
export const PERMISSION_ACTIONS = [
  'VIEW',
  'CREATE',
  'EDIT',
  'DELETE',
  'EXECUTE',
  'APPROVE',
  'MANAGE',
] as const;

export class PermissionDebugDto {
  @ApiProperty({ description: '被调试用户 ID' })
  @IsString()
  @MaxLength(64)
  userId!: string;

  @ApiProperty({ enum: PERMISSION_TARGET_TYPES, description: '权限类型' })
  @IsIn(PERMISSION_TARGET_TYPES as unknown as string[])
  type!: string;

  @ApiProperty({ enum: PERMISSION_ACTIONS, description: '权限动作' })
  @IsIn(PERMISSION_ACTIONS as unknown as string[])
  action!: string;

  @ApiProperty({ description: '目标资源 ID（对象/页面/流程 ID）' })
  @IsString()
  @MaxLength(64)
  targetId!: string;

  @ApiPropertyOptional({ description: '目标节点 ID（可选，流程节点级规则）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetNodeId?: string;

  @ApiPropertyOptional({
    description: '记录 ID（可选；提供时额外验证该记录在合并条件下是否可见）',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  recordId?: string;
}
