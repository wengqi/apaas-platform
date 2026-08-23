/**
 * 凭证 CRUD 请求 DTO — class-based，使 ValidationPipe 和 Swagger 同时生效。
 *
 * 对应 credential.service.ts 中的 CreateCredentialInput / UpdateCredentialInput interface。
 * Service 层继续使用 interface。
 */

import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  CredentialType,
  BasicCredentialData,
  ApiKeyCredentialData,
  BearerCredentialData,
} from '@apaas/shared';

/** 凭证数据联合类型 */
type CredentialData = BasicCredentialData | ApiKeyCredentialData | BearerCredentialData;

export class CreateCredentialDto {
  @ApiProperty({ example: '天气服务凭证', description: '凭证名称' })
  @IsString()
  name!: string;

  @ApiProperty({
    enum: ['BASIC', 'API_KEY', 'BEARER'],
    enumName: 'CredentialType',
    example: 'API_KEY',
    description: '凭证类型',
  })
  @IsEnum(['BASIC', 'API_KEY', 'BEARER'] satisfies readonly CredentialType[])
  type!: CredentialType;

  @ApiProperty({
    description: '凭证数据（明文，后端加密后存储）',
    example: { apiKey: 'sk-xxx' },
    type: 'object',
  })
  @IsObject()
  data!: CredentialData;
}

export class UpdateCredentialDto {
  @ApiPropertyOptional({ example: '天气服务凭证', description: '凭证名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: '凭证数据（明文，后端加密后存储）',
    example: { apiKey: 'sk-xxx' },
    type: 'object',
  })
  @IsOptional()
  @IsObject()
  data?: CredentialData;
}
