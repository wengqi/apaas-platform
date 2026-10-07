/**
 * amis-editor 自定义插件 —「对象字段绑定」面板注入（2026-10-07 字段绑定专项）。
 *
 * 背景：amis 后端无关，官方属性面板的「字段名」（name）为自由文本输入，手输
 * 写错时服务端写路径不拒未知键（实测静默存入记录）。本插件在选中表单控件的
 * 右侧面板追加「对象字段绑定」区块，从页面 data.objectId 对应对象的字段列表
 * 中下拉选择，写回控件 name（name=apiName）；原生「字段名」输入框保留为手输通道。
 *
 * 扩展点依据（amis-editor-core 6.13 lib/plugin.d.ts / component/Editor.d.ts）：
 * - EditorProps.plugins 接收 PluginClass，由 EditorManager 实例化
 * - BasePlugin.buildEditorPanel(context, panels) 对每次选中节点调用（manager 对
 *   所有插件无差别调用，插件自行判定节点类型后 push BasicPanelItem）
 * - PanelProps { value, onChange } 即选中节点 schema 的读写句柄
 */

import React, { useSyncExternalStore } from 'react';
import { Select, Typography } from 'antd';
import { BasePlugin } from 'amis-editor';
import type { BasicPanelItem, BuildPanelEventContext, PanelProps } from 'amis-editor';
import { isBindableControlType } from '../../utils/page-binding.js';
import { getBoundObjectSnapshot, subscribeBoundObject } from './field-binding-store.js';

const { Text } = Typography;

const HINT_STYLE = { fontSize: 12, display: 'block', padding: 8 } as const;

/** 右侧面板内的字段选择器（PanelProps.value = 选中节点 schema）。 */
function FieldBindingSelect({ value, onChange }: PanelProps) {
  const snapshot = useSyncExternalStore(subscribeBoundObject, getBoundObjectSnapshot);
  // BaseSchema 无 name 属性声明，按节点原始 schema（Record）读写 name 绑定键
  const nodeSchema = (value ?? {}) as unknown as Record<string, unknown>;
  const current = typeof nodeSchema['name'] === 'string' ? nodeSchema['name'] : '';

  if (!snapshot.objectId) {
    return (
      <Text type="secondary" style={HINT_STYLE}>
        页面未绑定对象（schema.data.objectId），无法下拉选择字段；仍可在「属性 → 字段名」手动输入。
      </Text>
    );
  }
  if (snapshot.fields.length === 0) {
    return (
      <Text type="secondary" style={HINT_STYLE}>
        对象字段加载中或加载失败（字段为空）；可在「属性 → 字段名」手动输入。
      </Text>
    );
  }

  const options = snapshot.fields.map((f) => ({
    value: f.apiName,
    label: `${f.label}（${f.apiName}）`,
  }));
  if (current && !snapshot.fields.some((f) => f.apiName === current)) {
    // 当前 name 不命中任何字段：保留可见（防止下拉"吞掉"现有值），保存时会再告警
    options.unshift({ value: current, label: `${current}（当前值·未匹配字段）` });
  }

  return (
    <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Select
        showSearch
        optionFilterProp="label"
        value={current || undefined}
        options={options}
        placeholder="选择绑定的对象字段"
        style={{ width: '100%' }}
        popupMatchSelectWidth={false}
        onChange={(v) => onChange({ ...nodeSchema, name: v } as never)}
      />
      <Text type="secondary" style={{ fontSize: 12 }}>
        写入控件「字段名」（name = 字段 apiName），表单提交时按此键写入记录。
      </Text>
    </div>
  );
}

/** 表单项选中场景注入面板；非 form 数据域内节点不注入。 */
export default class FieldBindingPanelPlugin extends BasePlugin {
  override name = '对象字段绑定面板';

  private isFormFieldContext(context: BuildPanelEventContext): boolean {
    const schema = context.schema as Record<string, unknown> | undefined;
    if (!schema || !isBindableControlType(schema['type'])) return false;
    // 沿节点父链找 form 数据域（form 自身与页面级节点不参与对象字段绑定）
    let parent: { schema?: Record<string, unknown>; parent?: unknown } | null | undefined =
      context.node?.parent;
    while (parent) {
      if (parent.schema?.['type'] === 'form') return true;
      parent = parent.parent as typeof parent;
    }
    return false;
  }

  override buildEditorPanel(context: BuildPanelEventContext, panels: Array<BasicPanelItem>): void {
    if (!this.isFormFieldContext(context)) return;
    panels.push({
      key: 'apaas-field-binding',
      icon: 'fa fa-link',
      title: '对象字段绑定',
      order: -1, // 置于内置面板之前——绑定字段是一等操作
      position: 'right',
      component: FieldBindingSelect,
    });
  }
}
