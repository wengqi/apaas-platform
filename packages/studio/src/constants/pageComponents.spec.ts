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

  it('全平台组件总数达到 86（80 + 批次C7 的 6），完成与飞书组件数量对齐', () => {
    expect(Object.keys(COMPONENT_META)).toHaveLength(86);
  });

  const BATCH_C7_TYPES: ComponentType[] = [
    'html_display',
    'jsx_display',
    'dept_picker',
    'dept_picker_multi',
    'region_cascader_single',
    'region_cascader_multi',
  ];

  it('批次C7 收尾组件已注册并挂入正确分组', () => {
    const general = DESIGNER_GROUPS.find((g) => g.title === '通用');
    const dataInput = DESIGNER_GROUPS.find((g) => g.title === '数据输入');
    expect(general?.types).toContain('html_display');
    expect(general?.types).toContain('jsx_display');
    for (const t of BATCH_C7_TYPES) {
      if (t.startsWith('dept') || t.startsWith('region')) {
        expect(dataInput?.types).toContain(t);
      } else {
        expect(general?.types).toContain(t);
      }
      expect(COMPONENT_META[t]).toBeTruthy();
    }
  });

  const BATCH_C6_TYPES: ComponentType[] = [
    'profile_center',
    'notification_list',
    'task_detail',
    'my_tasks',
    'approval_admin',
  ];

  it('批次C6 业务审批组件已注册并挂入 业务/审批 分组', () => {
    const biz = DESIGNER_GROUPS.find((g) => g.title === '业务');
    const approval = DESIGNER_GROUPS.find((g) => g.title === '审批');
    expect(biz?.types).toEqual(['profile_center', 'notification_list']);
    expect(approval?.types).toEqual(['task_detail', 'my_tasks', 'approval_admin']);
    for (const type of BATCH_C6_TYPES) {
      expect(COMPONENT_META[type]).toBeTruthy();
    }
  });

  const BATCH_C5_TYPES: ComponentType[] = [
    'filter',
    'sort',
    'audit_list',
    'tree_list_single',
    'tree_list_multi',
  ];

  it('批次C5 数据展示组件已注册并挂入「数据展示」分组', () => {
    const group = DESIGNER_GROUPS.find((g) => g.title === '数据展示');
    expect(group).toBeTruthy();
    for (const type of BATCH_C5_TYPES) {
      expect(COMPONENT_META[type]).toBeTruthy();
      expect(group?.types).toContain(type);
    }
  });

  const BATCH_C4_TYPES: ComponentType[] = [
    'chart_radar',
    'chart_area',
    'chart_scatter',
    'chart_bar_horizontal',
    'chart_waterfall',
    'chart_wordcloud',
    'chart_combo',
    'progress_chart',
    'matrix_table',
    'statistic_group',
  ];

  it('批次C4 图表组件已注册并挂入「图表」分组（变体预设 chartType）', () => {
    const charts = DESIGNER_GROUPS.find((g) => g.title === '图表');
    expect(charts).toBeTruthy();
    for (const type of BATCH_C4_TYPES) {
      expect(COMPONENT_META[type]).toBeTruthy();
      expect(charts?.types).toContain(type);
    }
    // 图表变体通过 defaultProps 预设 chartType（复用 renderChart）
    for (const t of [
      'chart_radar',
      'chart_area',
      'chart_scatter',
      'chart_bar_horizontal',
      'chart_waterfall',
      'chart_wordcloud',
      'chart_combo',
    ] as ComponentType[]) {
      expect(COMPONENT_META[t]?.defaultProps.chartType).toBeTruthy();
    }
  });

  const BATCH_C3_TYPES: ComponentType[] = [
    'pagination',
    'steps',
    'collapse_panel',
    'carousel',
    'button_group',
    'flat_filter',
    'modal_dialog',
    'drawer',
    'popover_card',
  ];

  it('批次C3 组件已注册并挂入 导航/通用/弹层/常用 分组', () => {
    const nav = DESIGNER_GROUPS.find((g) => g.title === '导航');
    const popup = DESIGNER_GROUPS.find((g) => g.title === '弹层');
    const general = DESIGNER_GROUPS.find((g) => g.title === '通用');
    expect(nav?.types).toEqual(['tabs', 'pagination', 'steps']);
    expect(popup?.types).toEqual(['modal_dialog', 'drawer', 'popover_card']);
    const containerTypes: ComponentType[] = ['collapse_panel', 'carousel'];
    for (const t of containerTypes) {
      expect(general?.types).toContain(t);
      expect(COMPONENT_META[t]?.isContainer).toBe(true);
    }
    for (const type of BATCH_C3_TYPES) {
      expect(COMPONENT_META[type]).toBeTruthy();
    }
  });

  const BATCH_C2_TYPES: ComponentType[] = [
    'email_input',
    'phone_input',
    'user_picker_multi',
    'lookup_picker_multi',
    'image_upload',
    'rich_text_input',
    'cascader_single',
    'cascader_multi',
    'tree_select_single',
    'tree_select_multi',
  ];

  it('批次C2 输入组件已注册并挂入「数据输入」分组', () => {
    const dataInput = DESIGNER_GROUPS.find((g) => g.title === '数据输入');
    expect(dataInput).toBeTruthy();
    for (const type of BATCH_C2_TYPES) {
      expect(COMPONENT_META[type]).toBeTruthy();
      expect(dataInput?.types).toContain(type);
    }
  });
});
