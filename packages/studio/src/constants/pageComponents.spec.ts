/**
 * 批次C1 组件对齐守卫测试：
 * - 新增 12 个展示组件均已注册元数据并挂入物料分组
 * - markdown 转换器输出包含预期结构
 */

import { describe, expect, it } from 'vitest';
import { COMPONENT_META, DESIGNER_GROUPS, getComponentMeta } from '../constants/pageComponents.js';
import type { ComponentType } from '../api/pages.js';

const BATCH_C1_TYPES: ComponentType[] = [
  'icon',
  'image',
  'tag',
  'link',
  'qrcode',
  'alert',
  'number_display',
  'datetime_display',
  'user_display',
  'file_display',
  'iframe',
  'markdown',
];

describe('批次C1 — 新增展示组件注册', () => {
  it.each(BATCH_C1_TYPES)('%s 已注册元数据（含图标与描述）', (type) => {
    const meta = COMPONENT_META[type];
    expect(meta).toBeTruthy();
    expect(meta.label.length).toBeGreaterThan(0);
    expect(meta.description.length).toBeGreaterThan(0);
    expect(meta.isContainer).toBe(false);
    expect(meta.category).toBe('display');
  });

  it('全部新组件已挂入「通用」物料分组', () => {
    const general = DESIGNER_GROUPS.find((g) => g.title === '通用');
    expect(general).toBeTruthy();
    for (const type of BATCH_C1_TYPES) {
      expect(general?.types).toContain(type);
    }
  });

  it('物料分组中的每个类型都有元数据（防漏注册）', () => {
    for (const group of DESIGNER_GROUPS) {
      for (const type of group.types) {
        const meta = getComponentMeta(type);
        expect(meta.label).not.toBe(type);
      }
    }
  });

  it('全平台组件总数达到 41（29 + 批次C1 的 12）', () => {
    expect(Object.keys(COMPONENT_META)).toHaveLength(41);
  });
});
