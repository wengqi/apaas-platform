/**
 * JS 页面扩展（run_script 动作）单元测试 — Phase 2.10。
 *
 * 覆盖 executePageScript：变量写入 / vm 快照只读 / 独立作用域 / 错误传播。
 * action-executor 含 antd message 依赖，node 环境下直接测导出的纯执行器。
 */

import { describe, it, expect, vi } from 'vitest';
import { executePageScript } from '@apaas/shared/stores';

describe('executePageScript — JS 页面扩展', () => {
  it('ctx.setVariable 写入视图模型变量', () => {
    const setVariable = vi.fn();
    executePageScript("ctx.setVariable('vm.level', 'VIP')", {
      vm: {},
      setVariable,
      objectId: 'obj-1',
    });
    expect(setVariable).toHaveBeenCalledWith('vm.level', 'VIP');
  });

  it('ctx.vm 提供当前视图模型快照（只读引用）', () => {
    const setVariable = vi.fn();
    executePageScript("if (ctx.vm.order.amount > 1000) { ctx.setVariable('vm.tag', 'big') }", {
      vm: { order: { amount: 2000 } },
      setVariable,
    });
    expect(setVariable).toHaveBeenCalledWith('vm.tag', 'big');
  });

  it('脚本为独立函数作用域：严格模式下未声明变量赋值抛错（不污染全局）', () => {
    expect(() => executePageScript('undeclared = 1', { vm: {}, setVariable: vi.fn() })).toThrow();
  });

  it('脚本抛错向上传播（动作链统一 toast，不静默）', () => {
    expect(() =>
      executePageScript('throw new Error("boom")', { vm: {}, setVariable: vi.fn() }),
    ).toThrow('boom');
  });

  it('ctx.objectId 可用（关联对象场景）', () => {
    const setVariable = vi.fn();
    executePageScript("ctx.setVariable('vm.objId', ctx.objectId)", {
      vm: {},
      setVariable,
      objectId: 'obj-9',
    });
    expect(setVariable).toHaveBeenCalledWith('vm.objId', 'obj-9');
  });
});
