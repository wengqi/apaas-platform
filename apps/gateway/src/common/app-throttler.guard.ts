/**
 * 应用限流守卫——限流维度：认证请求按用户/令牌分桶，匿名按 IP。
 *
 * 默认 ThrottlerGuard 按 IP 计数：本地开发/同源部署下所有客户端共享
 * 127.0.0.1 一个桶（R5.5 用户实测 2026-10-09：多账号并发触发 429 打断
 * 用户提交流程，台账页定义请求连续 4 次 429 呈重试风暴）。
 * 登录端点无 Authorization 头仍走 IP 桶——防爆破语义不变；已认证请求
 * 按 Bearer 令牌哈希分桶（不依赖 JWT 守卫解析顺序，重登换桶可接受：
 * 重登本身受 auth 路由 IP 桶约束）。
 */

import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'node:crypto';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  // 参数类型与基类签名保持结构兼容（运行时仅按结构取字段，unknown 足够）
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const r = req as {
      user?: { id?: string };
      headers?: Record<string, string | undefined>;
      ips?: string[];
      ip?: string;
    };
    const userId = r.user?.id;
    if (userId) return `user:${userId}`;
    const auth = r.headers?.['authorization'];
    if (auth?.startsWith('Bearer ')) {
      return `token:${createHash('sha256').update(auth).digest('hex').slice(0, 16)}`;
    }
    return `ip:${r.ips?.[0] ?? r.ip ?? 'unknown'}`;
  }
}
