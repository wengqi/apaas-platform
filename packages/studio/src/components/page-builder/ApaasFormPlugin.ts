/**
 * ApaasFormPlugin — 平台版 form 插件：把对象字段接入 amis-editor 原生
 * 「字段名」数据绑定选择器（感叹号弹窗，ae-DataBindingControl）。
 *
 * 背景（2026-10-07 字段绑定专项升级）：官方选择器的数据源钩子在 amis-editor
 * 6.13 内置插件中零实现（getAvailableContextFields / buildDataSchemas 均无），
 * 弹窗恒为空。本插件禁用内置 FormPlugin 后以子类接管 form 节点：
 * - buildDataSchemas：为 form 节点注册数据域（作用域），使官方选择器的
 *   作用域遍历能停在 form 上；
 * - getAvailableContextFields：返回 ae-SimpleDataBindingPanel schema（官方
 *   选择器渲染器），字段按「对象」分组、官方自带搜索；类型兼容专项（v3）：
 *   按目标控件类型经 field-control-compat 矩阵软过滤——兼容组在前，不兼容
 *   字段折叠为「类型不兼容」组（保留逃生舱，与保存告警哲学一致）。
 *
 * 绑定对象解析：form.api.url 优先（/objects/:id/records），页面级
 * data.objectId 兜底——同页多表各归各的 form。
 */

import type { EditorNodeType } from 'amis-editor-core';
import { FormPlugin } from 'amis-editor';
import type { BoundObjectField } from './field-binding-store.js';
import { getBoundObjectSnapshot } from './field-binding-store.js';
import { extractObjectIdFromApiUrl } from '../../utils/page-binding.js';
import { partitionFieldsByCompat } from '../../utils/field-control-compat.js';

interface BindingPanelChild {
  label: string;
  value: string;
}

/** 读取 form 节点解析出的绑定对象字段（store 同步缓存，可能为空=未拉到）。
 *  对象解析与保存校验同口径：form.api.url 优先，页面级 data.objectId 兜底。 */
function resolveFormFields(scopeNode: EditorNodeType | undefined): {
  objectId: string | null;
  fields: readonly BoundObjectField[];
  objectLabel: string;
} {
  const formSchema = (scopeNode?.schema ?? {}) as Record<string, unknown>;
  // 沿父链找页面节点的 data.objectId 兜底（form 自身 api 未设置时）
  let pageObjectId: string | null = null;
  let ancestor: { schema?: Record<string, unknown>; parent?: unknown } | undefined =
    scopeNode?.parent;
  while (ancestor) {
    if (ancestor.schema?.['type'] === 'page') {
      const data = ancestor.schema['data'];
      const oid =
        data && typeof data === 'object' && !Array.isArray(data)
          ? (data as Record<string, unknown>)['objectId']
          : undefined;
      if (typeof oid === 'string' && oid !== '') pageObjectId = oid;
      break;
    }
    ancestor = ancestor.parent as typeof ancestor;
  }
  const objectId = extractObjectIdFromApiUrl(formSchema['api']) ?? pageObjectId;
  const snapshot = getBoundObjectSnapshot();
  const fields = objectId ? (snapshot.objects[objectId] ?? []) : [];
  const objectLabel =
    objectId && typeof formSchema['title'] === 'string'
      ? (formSchema['title'] as string)
      : (objectId ?? '');
  return { objectId, fields, objectLabel };
}

export default class ApaasFormPlugin extends FormPlugin {
  override name = '表单（平台字段绑定）';

  /**
   * 官方选择器数据源：返回分组字段面板 schema。
   * 结构约定（amis-editor DataBindingControl）：顶层项=分组（label/value/children），
   * children 项选中后 childItem.value 写回控件 name、childItem.label 联动 label。
   * 列表项 label 只用显示名——官方 onBindingChange 会把选中项 label 联动写入控件
   * 标题，复合后缀（apiName）会污染页面标题；apiName 可经搜索按 value 命中。
   * 类型兼容（v3）：按目标控件软过滤，不兼容字段单独成组放后。
   */
  override async getAvailableContextFields(
    scopeNode: EditorNodeType,
    target: EditorNodeType,
  ): Promise<Record<string, unknown> | void> {
    const { objectId, fields, objectLabel } = resolveFormFields(scopeNode);
    if (!objectId) {
      // 未绑定对象：返回引导组而非 void——void 会触发官方顶层提示
      // 「暂无可绑定字段」，用户无从知道原因与修法
      return {
        type: 'ae-SimpleDataBindingPanel',
        fields: [
          {
            label: '表单未绑定对象：需提交地址 /objects/:id/records 或页面级绑定',
            value: 'unbound',
            children: [],
          },
        ],
      };
    }
    if (fields.length === 0) {
      // 对象已识别但字段未加载（拉取中/失败）：显式化，区别于"无字段"
      return {
        type: 'ae-SimpleDataBindingPanel',
        fields: [
          {
            label: `对象字段加载中或加载失败（${objectLabel || objectId}），请重开弹窗重试`,
            value: `${objectId}__loading`,
            children: [],
          },
        ],
      };
    }
    const targetSchema = (target?.schema ?? {}) as Record<string, unknown>;
    const { compatible, incompatible } = partitionFieldsByCompat(
      targetSchema['type'],
      targetSchema['multiple'] === true,
      fields,
    );
    const toChildren = (list: readonly BoundObjectField[]): BindingPanelChild[] =>
      list.map((f) => ({ label: f.label, value: f.apiName }));
    const groups: Array<{ label: string; value: string; children: BindingPanelChild[] }> = [
      {
        label: `对象字段（${objectLabel || objectId}）`,
        value: objectId,
        children: toChildren(compatible),
      },
    ];
    if (incompatible.length > 0) {
      groups.push({
        label: `类型不兼容（控件 ${String(targetSchema['type'])}）`,
        value: `${objectId}__incompatible`,
        children: toChildren(incompatible),
      });
    }
    return { type: 'ae-SimpleDataBindingPanel', fields: groups };
  }

  /**
   * 为 form 节点注册数据域作用域。**必须总是注册**（识别出绑定对象时）：
   * 官方选择器的遍历找"最近的有作用域祖先"，若 form 无作用域会越过 form
   * 调用更上层节点的钩子（返回空 → 顶层「暂无可绑定字段」），且作用域只在
   * 节点挂载时构建一次——挂载时字段缓存未到（硬刷新后首开必现）就走回退
   * 会永久错过。字段面板内容在弹窗打开时经钩子同步读 store，不受此缓存
   * 陈旧影响；属性表（表达式变量提示）在字段到货后随节点重建刷新。
   * 完全未绑定对象的 form 回退内置行为（按画布子控件聚合）。
   */
  override async buildDataSchemas(
    node: EditorNodeType,
    region: EditorNodeType,
    trigger?: EditorNodeType,
  ): Promise<Record<string, unknown>> {
    const { objectId, fields } = resolveFormFields(node);
    if (!objectId) {
      return super.buildDataSchemas(node, region, trigger);
    }
    const properties: Record<string, unknown> = {};
    for (const f of fields) {
      properties[f.apiName] = { type: 'string', title: f.label };
    }
    return { type: 'object', properties };
  }
}
