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
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),

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
  CONNECTOR_ENCRYPTION_KEY: Joi.string().hex().length(64).required(),

  // ---- 云函数沙箱 ----
  CLOUD_FUNCTION_MEMORY_LIMIT_MB: Joi.number().default(128),
  CLOUD_FUNCTION_TIMEOUT_MS: Joi.number().default(5000),

  // ---- 记录批量操作 / 导入导出 ----
  BATCH_MAX_ROWS: Joi.number().default(500),
  IMPORT_MAX_ROWS: Joi.number().default(5000),
  IMPORT_FILE_MAX_SIZE_MB: Joi.number().default(10),

  // ---- 日志 ----
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace').default('info'),
});
