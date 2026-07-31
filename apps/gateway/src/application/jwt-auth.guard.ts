import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JWT 认证守卫。
 * 使用 Passport JWT 策略校验 Bearer token。
 * 校验通过后 req.user = JwtPayload { sub, tenantId, email }。
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
