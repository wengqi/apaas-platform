/**
 * 环境变量校验 Schema — 启动时 fail-fast，防止配置错误静默运行。
 *
 * ConfigModule.forRoot({ validationSchema: envValidation }) 会在应用启动时
 * 校验 process.env，必填项缺失或不合规则直接抛异常终止进程。
 */

import * as Joi from 'joi';

export const envValidation = Joi.object({
  // ---- 运行环境 ----
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),

  // ---- PostgreSQL ----
  DATABASE_URL: Joi.string().required(),

  // ---- Redis ----
  REDIS_URL: Joi.string().required(),

  // ---- 认证 (JWT) ----
  JWT_SECRET: Joi.string()
    .min(16)
    .required()
    .custom((value: string, helpers) => {
      // 生产环境拒绝已知弱密钥（评审 C-1：默认密钥可离线签发任意租户 JWT）
      if (process.env.NODE_ENV === 'production' && /^(dev-secret|change-me|test)/i.test(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'production-weak-secret'),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  // refreshToken 有效期（派生密钥签发，见 auth.service refreshSecret；MCP 长生命周期客户端续期用）
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),

  // ---- CORS ----
  CORS_ORIGINS: Joi.string().optional(),

  // ---- 服务端口 ----
  GATEWAY_PORT: Joi.number().default(3000),

  // ---- SMTP 邮件（可选，未配置时邮件功能降级） ----
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().optional(),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASS: Joi.string().optional(),
  SMTP_FROM: Joi.string().optional(),

  // ---- 连接器凭证加密 ----
  CONNECTOR_ENCRYPTION_KEY: Joi.string()
    .hex()
    .length(64)
    .required()
    .custom((value: string, helpers) => {
      // 生产环境拒绝全零密钥（评审 C-1：已知密钥可解密全部租户凭证）
      if (process.env.NODE_ENV === 'production' && /^0+$/.test(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'production-zero-key'),

  // ---- 生产部署种子保护（评审 C-1）----
  // 生产环境首次启动创建种子账号必须显式提供口令；未提供则跳过账号种子
  SEED_BOOTSTRAP_PASSWORD: Joi.string().min(8).optional(),

  // ---- 云函数沙箱 ----
  CLOUD_FUNCTION_MEMORY_LIMIT_MB: Joi.number().default(128),
  CLOUD_FUNCTION_TIMEOUT_MS: Joi.number().default(5000),
  // 进程内并发 Isolate 上限（评审 M-8：无预算时 50 并发 × 128MB = OOM）
  CLOUD_FUNCTION_MAX_CONCURRENT: Joi.number().default(4),

  // ---- 观测（P1 运维治理）----
  // 慢查询阈值（毫秒）：超过即落 SLOW_QUERY 观测事件；0/负数/非法回退默认 1000
  SLOW_QUERY_THRESHOLD_MS: Joi.number().default(1000),

  // ---- 出站请求（SSRF 防护）----
  OUTBOUND_HTTP_TIMEOUT_MS: Joi.number().default(10_000),
  // 允许出站访问私网地址（仅限开发/联调，生产必须为 false）
  OUTBOUND_ALLOW_PRIVATE: Joi.boolean().default(false),
  // P1-07 分布式锁看门狗（可选）
  REDIS_LOCK_TTL_MS: Joi.number().integer().min(1000).default(30000),
  REDIS_LOCK_MAX_WAIT_MS: Joi.number().integer().min(100).default(10000),
  // P1-21 权限决策缓存 TTL（可选；0=禁用缓存语义）
  PERMISSION_CACHE_TTL_MS: Joi.number().integer().min(0).default(30000),

  // ---- 记录批量操作 / 导入导出 ----
  BATCH_MAX_ROWS: Joi.number().default(500),
  IMPORT_MAX_ROWS: Joi.number().default(5000),
  IMPORT_FILE_MAX_SIZE_MB: Joi.number().default(10),

  // ---- 限流（@nestjs/throttler）----
  THROTTLE_TTL_MS: Joi.number().default(60_000),
  THROTTLE_DEFAULT_LIMIT: Joi.number().default(100),
  THROTTLE_AUTH_LIMIT: Joi.number().default(10),
  // G6 开放 API 限流桶（/api/v1/open/*）
  THROTTLE_OPEN_LIMIT: Joi.number().default(120),

  // ---- 审批回调（AI agent 闭环：批/驳 webhook 替代轮询）----
  // 配置后批/驳（单资源与批量）POST 事件载荷到该 URL（safeFetch SSRF 防护）；
  // REVIEW_CALLBACK_SECRET 配置时附 X-Apaas-Signature（HMAC-SHA256 hex）
  REVIEW_CALLBACK_URL: Joi.string().uri().optional(),
  REVIEW_CALLBACK_SECRET: Joi.string().min(16).optional(),

  // ---- 日志 ----
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace').default('info'),
});
