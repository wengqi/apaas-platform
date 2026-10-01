/**
 * 租户上下文 ALS 测试 — AsyncLocalStorage set/get/clear/嵌套/系统上下文。
 */

import { describe, it, expect } from 'vitest';
import {
  getTenantId,
  getTenantContext,
  isSystemContext,
  runWithTenant,
  runAsSystem,
} from './tenant-context.js';

describe('tenant-context (AsyncLocalStorage)', () => {
  describe('getTenantId', () => {
    it('无上下文时返回 null', () => {
      expect(getTenantId()).toBeNull();
    });

    it('runWithTenant 内返回设置的 tenantId', () => {
      runWithTenant('tenant-123', () => {
        expect(getTenantId()).toBe('tenant-123');
      });
    });

    it('runWithTenant 退出后恢复为 null', () => {
      runWithTenant('tenant-123', () => {
        expect(getTenantId()).toBe('tenant-123');
      });
      expect(getTenantId()).toBeNull();
    });
  });

  describe('getTenantContext', () => {
    it('无上下文时返回 undefined', () => {
      expect(getTenantContext()).toBeUndefined();
    });

    it('租户上下文返回 { tenantId, explicit: true }', () => {
      runWithTenant('tenant-456', () => {
        const ctx = getTenantContext();
        expect(ctx).toEqual({ tenantId: 'tenant-456', explicit: true, environmentId: null });
      });
    });

    it('系统上下文返回 { tenantId: null, explicit: true }', () => {
      runAsSystem(() => {
        const ctx = getTenantContext();
        expect(ctx).toEqual({ tenantId: null, explicit: true, environmentId: null });
      });
    });
  });

  describe('isSystemContext', () => {
    it('无上下文时返回 false', () => {
      expect(isSystemContext()).toBe(false);
    });

    it('租户上下文内返回 false', () => {
      runWithTenant('tenant-789', () => {
        expect(isSystemContext()).toBe(false);
      });
    });

    it('系统上下文内返回 true', () => {
      runAsSystem(() => {
        expect(isSystemContext()).toBe(true);
      });
    });
  });

  describe('runWithTenant', () => {
    it('返回 fn 的返回值', () => {
      const result = runWithTenant('t1', () => 42);
      expect(result).toBe(42);
    });

    it('支持异步函数', async () => {
      const result = await runWithTenant('t2', async () => {
        await new Promise((r) => setTimeout(r, 1));
        return getTenantId();
      });
      expect(result).toBe('t2');
    });

    it('嵌套 runWithTenant 使用内层 tenantId', () => {
      runWithTenant('outer', () => {
        expect(getTenantId()).toBe('outer');
        runWithTenant('inner', () => {
          expect(getTenantId()).toBe('inner');
        });
        expect(getTenantId()).toBe('outer');
      });
    });

    it('嵌套 runAsSystem 在租户上下文内切换为系统上下文', () => {
      runWithTenant('tenant-a', () => {
        expect(getTenantId()).toBe('tenant-a');
        expect(isSystemContext()).toBe(false);
        runAsSystem(() => {
          expect(getTenantId()).toBeNull();
          expect(isSystemContext()).toBe(true);
        });
        expect(getTenantId()).toBe('tenant-a');
      });
    });
  });

  describe('runAsSystem', () => {
    it('返回 fn 的返回值', () => {
      const result = runAsSystem(() => 'system-result');
      expect(result).toBe('system-result');
    });

    it('系统上下文内 getTenantId 返回 null', () => {
      runAsSystem(() => {
        expect(getTenantId()).toBeNull();
      });
    });

    it('退出后恢复原状态', () => {
      runAsSystem(() => {
        // 系统上下文
      });
      expect(getTenantId()).toBeNull();
      expect(isSystemContext()).toBe(false);
    });
  });

  describe('异步上下文传播', () => {
    it('Promise 链保持上下文', async () => {
      await runWithTenant('async-tenant', async () => {
        await new Promise((r) => setTimeout(r, 1));
        expect(getTenantId()).toBe('async-tenant');
      });
    });

    it('setTimeout 回调保持上下文', async () => {
      await new Promise<void>((resolve) => {
        runWithTenant('timeout-tenant', () => {
          setTimeout(() => {
            expect(getTenantId()).toBe('timeout-tenant');
            resolve();
          }, 1);
        });
      });
    });
  });
});
