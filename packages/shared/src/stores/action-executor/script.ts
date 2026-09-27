/**
 * 事件动作执行器 — JS 页面扩展（从 action-executor.ts 拆分，
 * AGENTS.md 单文件 400 行规范）。
 *
 * Phase 2.10 — run_script 动作。
 */

import type { ActionContext } from './types.js';

/**
 * 执行页面 JS 扩展脚本。
 *
 * 信任模型：脚本由应用搭建者（BUILDER 角色）在 Studio 编写，与页面 Schema 同级信任，
 * 运行在终端用户自己的浏览器中（与页面内其余 JS 无隔离边界，等同飞书自定义 JS 的定位）。
 * 执行环境注入 ctx = { vm, setVariable, objectId }：
 *   - vm 为当前视图模型快照（只读引用，写变量必须走 setVariable）
 *   - 脚本为严格模式独立函数作用域，无法访问闭包外部变量
 * 脚本抛错向上传播（由动作链统一 toast 错误，不静默）。
 */
export function executePageScript(
  code: string,
  context: Pick<ActionContext, 'vm' | 'setVariable' | 'objectId'>,
): void {
  const fn = new Function('ctx', '"use strict";\n' + code) as (ctx: unknown) => void;
  fn({
    vm: context.vm,
    setVariable: context.setVariable,
    objectId: context.objectId,
  });
}
