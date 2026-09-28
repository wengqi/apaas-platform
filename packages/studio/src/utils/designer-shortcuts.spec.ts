/**
 * 设计器快捷键纯函数单测（批次D）。
 */

import { describe, expect, it } from 'vitest';
import { isTextEntryTarget, matchShortcut, spanFromDrag } from './designer-shortcuts.js';

describe('matchShortcut', () => {
  it('Ctrl/Cmd+Z → 撤销', () => {
    expect(matchShortcut({ key: 'z', ctrlKey: true, metaKey: false, shiftKey: false })).toBe(
      'undo',
    );
    expect(matchShortcut({ key: 'z', ctrlKey: false, metaKey: true, shiftKey: false })).toBe(
      'undo',
    );
  });

  it('Ctrl/Cmd+Y 与 Ctrl/Cmd+Shift+Z → 重做', () => {
    expect(matchShortcut({ key: 'y', ctrlKey: true, metaKey: false, shiftKey: false })).toBe(
      'redo',
    );
    expect(matchShortcut({ key: 'z', ctrlKey: true, metaKey: false, shiftKey: true })).toBe('redo');
  });

  it('裸 Delete/Backspace → 删除', () => {
    expect(matchShortcut({ key: 'Delete', ctrlKey: false, metaKey: false, shiftKey: false })).toBe(
      'delete',
    );
    expect(
      matchShortcut({ key: 'Backspace', ctrlKey: false, metaKey: false, shiftKey: false }),
    ).toBe('delete');
  });

  it('带修饰键的 Delete 不算删除', () => {
    expect(
      matchShortcut({ key: 'Delete', ctrlKey: true, metaKey: false, shiftKey: false }),
    ).toBeNull();
  });

  it('普通字符输入返回 null', () => {
    expect(matchShortcut({ key: 'a', ctrlKey: false, metaKey: false, shiftKey: false })).toBeNull();
  });
});

describe('isTextEntryTarget', () => {
  it('input/textarea/select/contenteditable 为文本输入目标', () => {
    expect(isTextEntryTarget({ tagName: 'input' })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'select' })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'div', isContentEditable: true })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'span' })).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
    expect(isTextEntryTarget(undefined)).toBe(false);
  });
});

describe('spanFromDrag', () => {
  it('按容器宽度 1/12 为步长换算', () => {
    expect(spanFromDrag(12, 0, 600)).toBe(12);
    expect(spanFromDrag(12, 50, 600)).toBe(12);
    expect(spanFromDrag(6, 50, 600)).toBe(7);
    expect(spanFromDrag(6, -50, 600)).toBe(5);
  });

  it('边界钳制在 1-12', () => {
    expect(spanFromDrag(1, -200, 600)).toBe(1);
    expect(spanFromDrag(12, 200, 600)).toBe(12);
  });

  it('容器宽度非法时保持原值', () => {
    expect(spanFromDrag(6, 100, 0)).toBe(6);
  });
});
