/**
 * 服务身份 DTO（G6）——JWT 管理面的请求合同。
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateServiceIdentityDto {
  @ApiProperty({ description: '身份名称（如 "ERP 系统集成"）' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: '绑定应用（省略 = 租户级）' })
  @IsOptional()
  @IsString()
  appId?: string;
}
