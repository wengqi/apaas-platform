/**
 * 环境变量校验 Schema 单元测试 — fail-fast 配置防护。
 */

import { describe, it, expect } from 'vitest';
import { envValidation } from './env.validation.js';

/** 合法的基础环境变量（各测试在此之上增删）。 */
const VALID_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'a-sufficiently-long-secret-value',
  CONNECTOR_ENCRYPTION_KEY: 'a'.repeat(64),
};

function validate(env: Record<string, unknown>) {
  return envValidation.validate(env, { abortEarly: false });
}

describe('envValidation', () => {
  it('合法配置：校验通过并应用默认值', () => {
    const { error, value } = validate(VALID_ENV);

    expect(error).toBeUndefined();
    expect(value.GATEWAY_PORT).toBe(3000);
    expect(value.BATCH_MAX_ROWS).toBe(500);
    expect(value.THROTTLE_DEFAULT_LIMIT).toBe(100);
    expect(value.LOG_LEVEL).toBe('info');
  });

  it('缺少必填项（DATABASE_URL/REDIS_URL/JWT_SECRET/CONNECTOR_ENCRYPTION_KEY）：报错', () => {
    const { error } = validate({ NODE_ENV: 'test' });
    expect(error).toBeDefined();
    // 4 个必填项全部报出（fail-fast 覆盖所有缺失项而非首个）
    expect(error?.details.length).toBeGreaterThanOrEqual(4);
  });

  it('JWT_SECRET 短于 16 位：报错', () => {
    const { error } = validate({ ...VALID_ENV, JWT_SECRET: 'short' });
    expect(error).toBeDefined();
  });

  it('CONNECTOR_ENCRYPTION_KEY 非 64 位 hex：报错', () => {
    const { error } = validate({ ...VALID_ENV, CONNECTOR_ENCRYPTION_KEY: 'not-hex-key' });
    expect(error).toBeDefined();
  });

  it('NODE_ENV 非法值：报错', () => {
    const { error } = validate({ ...VALID_ENV, NODE_ENV: 'staging' });
    expect(error).toBeDefined();
  });

  it('LOG_LEVEL 非法值：报错', () => {
    const { error } = validate({ ...VALID_ENV, LOG_LEVEL: 'verbose' });
    expect(error).toBeDefined();
  });
});
