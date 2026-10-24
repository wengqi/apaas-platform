/**
 * 连接器 CRUD 请求 DTO — class-based，使 ValidationPipe 和 Swagger 同时生效。
 *
 * 对应 @apaas/shared 中的 CreateConnectorRequest / UpdateConnectorRequest /
 * InvokeConnectorRequest interface。Service 层继续使用 interface。
 */

import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ConnectorType, ConnectorStatus } from '@apaas/shared';

export class CreateConnectorDto {
  @ApiProperty({ example: 'weather_api', description: '连接器 API 名称' })
  @IsString()
  apiName!: string;

  @ApiProperty({ example: '天气服务', description: '连接器名称' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: '天气查询连接器', description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    enum: ['HTTP', 'WEBHOOK'],
    enumName: 'ConnectorType',
    example: 'HTTP',
    description: '连接器类型',
  })
  @IsEnum(['HTTP', 'WEBHOOK'] satisfies readonly ConnectorType[])
  type!: ConnectorType;

  @ApiPropertyOptional({ example: 'https://api.weather.com', description: '基础 URL' })
  @IsOptional()
  @IsString()
  baseUrl?: string;

  @ApiPropertyOptional({ description: '连接器配置（JSON）' })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'cred_xxx', description: '关联凭证 ID' })
  @IsOptional()
  @IsString()
  credentialId?: string;

  @ApiPropertyOptional({
    description: 'Webhook 绑定（仅 WEBHOOK 类型）：触发的目标流程 ID（校验同应用 + WEBHOOK 触发）',
  })
  @IsOptional()
  @IsString()
  processDefId?: string;
}

export class UpdateConnectorDto {
  @ApiPropertyOptional({ example: '天气服务', description: '连接器名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '天气查询连接器', description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'https://api.weather.com', description: '基础 URL' })
  @IsOptional()
  @IsString()
  baseUrl?: string;

  @ApiPropertyOptional({ description: '连接器配置（JSON）' })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'cred_xxx', description: '关联凭证 ID' })
  @IsOptional()
  @IsString()
  credentialId?: string;

  @ApiPropertyOptional({
    enum: ['ACTIVE', 'INACTIVE'],
    enumName: 'ConnectorStatus',
    example: 'ACTIVE',
    description: '连接器状态',
  })
  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE'] satisfies readonly ConnectorStatus[])
  status?: ConnectorStatus;

  @ApiPropertyOptional({
    description:
      'Webhook 绑定（仅 WEBHOOK 类型）：null=解绑；字符串=绑定/改绑（校验同应用 + WEBHOOK 触发）',
    nullable: true,
    oneOf: [{ type: 'string' }, { type: 'null' }],
  })
  // class-validator 0.15：IsOptional 对 null 与 undefined 均跳过校验（可空解绑语义）
  @IsOptional()
  @IsString()
  processDefId?: string | null;
}

export class InvokeConnectorDto {
  @ApiPropertyOptional({ example: 'getWeather', description: '操作 ID' })
  @IsOptional()
  @IsString()
  operationId?: string;

  @ApiPropertyOptional({ example: 'GET', description: '覆盖 HTTP 方法' })
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional({ example: '/v1/weather', description: '覆盖路径（相对 baseUrl）' })
  @IsOptional()
  @IsString()
  path?: string;

  @ApiPropertyOptional({ description: '额外请求头' })
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @ApiPropertyOptional({ description: '请求体' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ description: '路径参数 / 模板变量' })
  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;
}
