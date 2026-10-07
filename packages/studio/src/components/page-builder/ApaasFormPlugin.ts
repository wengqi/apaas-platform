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
 *   选择器渲染器），字段按"对象（显示名）"分组、官方自带搜索，选中后由
 *   官方 onBindingChange 写回 name 并联动 label。
 *
 * 绑定对象解析：form.api.url 优先（/objects/:id/records），页面级
 * data.objectId 兜底——同页多表各归各的 form。
 */

import type { EditorNodeType } from 'amis-editor-core';
import { FormPlugin } from 'amis-editor';
import type { BoundObjectField } from './field-binding-store.js';
import { getBoundObjectSnapshot } from './field-binding-store.js';
import { extractObjectIdFromApiUrl } from '../../utils/page-binding.js';

/** 读取 form 节点解析出的绑定对象字段（store 同步缓存，可能为空=未拉到）。 */
function resolveFormFields(scopeNode: EditorNodeType | undefined): {
  objectId: string | null;
  fields: readonly BoundObjectField[];
  objectLabel: string;
} {
  const formSchema = (scopeNode?.schema ?? {}) as Record<string, unknown>;
  const objectId = extractObjectIdFromApiUrl(formSchema['api']);
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
   */
  override async getAvailableContextFields(
    scopeNode: EditorNodeType,
    _target: EditorNodeType,
  ): Promise<Record<string, unknown> | void> {
    const { objectId, fields, objectLabel } = resolveFormFields(scopeNode);
    if (!objectId) return;
    // 列表项 label 只用显示名——官方 onBindingChange 会把选中项 label 联动写入控件
    // 标题，复合后缀（apiName）会污染页面标题；apiName 可经搜索按 value 命中
    const children = fields.map((f) => ({ label: f.label, value: f.apiName }));
    return {
      type: 'ae-SimpleDataBindingPanel',
      fields: [
        {
          label: `对象字段（${objectLabel || objectId}）`,
          value: objectId,
          children,
        },
      ],
    };
  }

  /**
   * 为 form 节点注册数据域作用域（无此作用域，官方选择器的作用域遍历不会
   * 停在 form 上，钩子不会被触发）。属性键=字段 apiName，与运行时表单数据域
   * 键序一致（表达式编辑器的变量提示同步受益）。字段未加载时回退内置行为
   * （按画布子控件聚合），避免数据域空洞。
   */
  override async buildDataSchemas(
    node: EditorNodeType,
    region: EditorNodeType,
    trigger?: EditorNodeType,
  ): Promise<Record<string, unknown>> {
    const { objectId, fields } = resolveFormFields(node);
    if (!objectId || fields.length === 0) {
      return super.buildDataSchemas(node, region, trigger);
    }
    const properties: Record<string, unknown> = {};
    for (const f of fields) {
      properties[f.apiName] = { type: 'string', title: f.label };
    }
    return { type: 'object', properties };
  }
}
