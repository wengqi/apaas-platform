/**
 * 事件动作执行器 — 动作链中断信号（从 action-executor.ts 拆分，
 * AGENTS.md 单文件 400 行规范）。
 */

/** confirm 取消时抛出，用于中断动作链（不作为错误提示）。 */
export class ActionChainInterrupt extends Error {
  constructor() {
    super('ActionChainInterrupt');
    this.name = 'ActionChainInterrupt';
  }
}
