/**
 * 设计器快捷键匹配（纯函数，供键盘事件监听使用）。
 *
 * 对齐飞书：Delete/Backspace 删除选中组件、Ctrl/Cmd+Z 撤销、
 * Ctrl/Cmd+Y 或 Ctrl/Cmd+Shift+Z 重做。
 */

export type DesignerShortcut = 'undo' | 'redo' | 'delete' | null;

/** 判断键盘事件对应的快捷键；非快捷键返回 null。 */
export function matchShortcut(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey?: boolean;
}): DesignerShortcut {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();

  if (mod && key === 'z' && !event.shiftKey) return 'undo';
  if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) return 'redo';

  // 删除：仅裸按键（无修饰键），避免误触输入法/组合键
  if (!mod && !event.shiftKey && !event.altKey && (key === 'delete' || key === 'backspace')) {
    return 'delete';
  }

  return null;
}

/**
 * 事件目标是否为文本输入类元素（结构化判别，不依赖 DOM 类型，
 * 便于 node 环境单测；输入中的快捷键不应触发设计器动作）。
 */
export function isTextEntryTarget(target: unknown): boolean {
  const el = target as { tagName?: unknown; isContentEditable?: unknown } | null | undefined;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

/** 由拖拽位移计算新的栅格跨度（1-12，飞书式左右 resize 手柄）。 */
export function spanFromDrag(baseSpan: number, deltaPx: number, containerPx: number): number {
  if (containerPx <= 0) return baseSpan;
  const perGrid = containerPx / 12;
  return Math.min(12, Math.max(1, baseSpan + Math.round(deltaPx / perGrid)));
}
