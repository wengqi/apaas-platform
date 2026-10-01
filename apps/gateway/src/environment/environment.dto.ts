/**
 * 环境管理 DTO（R1.4）——部署/回滚/环境变量请求合同。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ENVIRONMENT_KEYS } from '@apaas/shared';

/** 部署到环境 */
export class DeployToEnvironmentDto {
  @ApiPropertyOptional({ description: '目标版本 ID（缺省=最新已发布版本）' })
  @IsOptional()
  @IsString()
  versionId?: string;

  @ApiPropertyOptional({ description: '部署说明' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** 环境回滚 */
export class RollbackEnvironmentDto {
  @ApiProperty({ description: '回滚目标版本 ID' })
  @IsString()
  versionId!: string;

  @ApiPropertyOptional({ description: '回滚说明' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** 新建环境变量定义 */
export class CreateEnvVarDefDto {
  @ApiProperty({ description: '变量 Key（${env.KEY} 引用名，大写下划线惯例）' })
  @IsString()
  @MaxLength(100)
  key!: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({ description: '是否必填（G4 发布硬闸）' })
  @IsOptional()
  required?: boolean;

  @ApiPropertyOptional({ description: '是否敏感（G3：加密落库、写后不可读）' })
  @IsOptional()
  sensitive?: boolean;
}

/** 设置环境变量值 */
export class SetEnvVarValueDto {
  @ApiProperty({ description: '变量值（敏感值加密落库）' })
  @IsString()
  @MaxLength(2000)
  value!: string;
}

/** 环境查询参数 */
export class EnvironmentQueryDto {
  @ApiPropertyOptional({ enum: [...ENVIRONMENT_KEYS], description: '环境 key（缺省 prod）' })
  @IsOptional()
  @IsIn(ENVIRONMENT_KEYS as unknown as string[])
  env?: string;
}
