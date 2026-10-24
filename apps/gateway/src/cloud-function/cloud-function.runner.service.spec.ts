/**
 * CloudFunctionRunner 单元测试 — Isolate 生命周期管理（B8 修复验证）。
 *
 * 验证 isolate.dispose() 在成功和失败路径均被调用（finally 块）。
 * vi.mock 会被编译器提升到所有 import 之前，确保 mock 生效。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';

const mockDispose = vi.fn();

vi.mock('isolated-vm', () => ({
  default: {
    Isolate: vi.fn(() => ({
      createContextSync: () => ({
        global: { setSync: () => {} },
      }),
      compileScriptSync: (code: string) => {
        if (code.includes('SYNTAX_ERROR_MARKER')) {
          throw new Error('SyntaxError: Unexpected token');
        }
        return {
          // 对抗审查 security-05/R2（P0-3）：runSync 会阻塞网关主线程，全 spec 用炸雷桩防回归
          runSync: () => {
            throw new Error('FORBIDDEN: runSync 阻塞网关主线程，租户代码必须走异步 run（P0-3）');
          },
          run: async () => {
            if (code.includes('TIMEOUT_MARKER')) {
              throw new Error('Execution timed out');
            }
          },
        };
      },
      dispose: mockDispose,
    })),
    ExternalCopy: vi.fn((data: unknown) => ({ copyInto: () => data })),
    Reference: vi.fn(() => ({
      applySync: () => {},
    })),
  },
}));

// 静态 import — vi.mock 会被提升到此前执行
import { CloudFunctionRunner } from './cloud-function.runner.service.js';

describe('CloudFunctionRunner — Isolate 生命周期（B8）', () => {
  let configService: ConfigService;

  beforeEach(() => {
    mockDispose.mockClear();
    configService = {
      get: vi.fn((key: string) => {
        if (key === 'CLOUD_FUNCTION_MEMORY_LIMIT_MB') return 128;
        if (key === 'CLOUD_FUNCTION_TIMEOUT_MS') return 100;
        return undefined;
      }),
    } as unknown as ConfigService;
  });

  it('正常执行后 isolate.dispose 被调用', async () => {
    const runner = new CloudFunctionRunner(configService);

    await runner.execute(
      'async function handler(input, context) { return { ok: true }; }',
      {},
      'tenant-1',
      'app-1',
    );

    expect(mockDispose).toHaveBeenCalled();
  });

  it('语法错误执行后 isolate.dispose 仍被调用（不泄漏）', async () => {
    const runner = new CloudFunctionRunner(configService);

    const result = await runner.execute(
      'SYNTAX_ERROR_MARKER this is not valid javascript',
      {},
      'tenant-1',
      'app-1',
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('SyntaxError');
    expect(mockDispose).toHaveBeenCalled();
  });

  it('runSync 超时后 isolate.dispose 仍被调用', async () => {
    const runner = new CloudFunctionRunner(configService);

    const result = await runner.execute(
      'TIMEOUT_MARKER async function handler(input, context) { while(true); }',
      {},
      'tenant-1',
      'app-1',
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
    expect(mockDispose).toHaveBeenCalled();
  });
});
