/**
 * 刷新令牌请求 DTO — class-based，使 ValidationPipe 和 Swagger 同时生效。
 */

import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ description: '登录时签发的 refreshToken', minLength: 20 })
  @IsString()
  @MinLength(20)
  refreshToken!: string;
}
