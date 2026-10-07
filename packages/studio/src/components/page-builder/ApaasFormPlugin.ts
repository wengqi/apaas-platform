/**
 * ApaasFormPlugin — 平台版 form 插件：把对象字段接入 amis-editor 原生
 * 「字段名」数据绑定选择器（感叹号弹窗，ae-DataBindingControl）。
 *
 * 背景（2026-10-07 字段绑定专项）：官方选择器的数据源钩子在 amis-editor
 * 6.13 内置插件中零实现，弹窗恒为空。本插件禁用内置 FormPlugin 后以子类接管：
 * - getAvailableContextFields：返回 ae-SimpleDataBindingPanel schema（官方
 *   选择器渲染器），字段按「对象」分组、类型兼容软过滤（field-control-compat）；
 * - buildDataSchemas：为 form 节点注册数据域作用域（表达式变量提示同步受益）。
 *
 * 作用域竞态兜底（2026-10-07 空弹窗修复，用户操作路径复现）：官方渲染包装组件
 * **卸载时会 removeScope**、重挂载只 addScope 空占位——确认绑定（onBulkChange 联动
 * label）触发 form 区域重渲染后，form 作用域存在真空窗口；此窗口内打开弹窗，
 * 官方 scope 查找越过 form 落到上层节点返回空（顶层「暂无可绑定字段」），
 * 且切走再切回控件后 scope 重建又恢复正常。故在构造时包装
 * manager.getAvailableContextFields（弹窗打开的必经函数）：官方链路返回空时，
 * 直接按目标控件的 form 祖先给出平台字段面板，不依赖 scope 查找。
 *
 * 绑定对象解析：form.api.url 优先（/objects/:id/records），页面级
 * data.objectId 兜底——同页多表各归各的 form，与保存校验同口径。
 */

import type { EditorNodeType, EditorManager } from 'amis-editor-core';
import { FormPlugin } from 'amis-editor';
import type { BoundObjectField } from './field-binding-store.js';
import { getBoundObjectSnapshot } from './field-binding-store.js';
import { extractObjectIdFromApiUrl } from '../../utils/page-binding.js';
import { partitionFieldsByCompat } from '../../utils/field-control-compat.js';

interface BindingPanelChild {
  label: string;
  value: string;
}

interface BindingPanelGroup {
  label: string;
  value: string;
  children: BindingPanelChild[];
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 包装 manager 内部方法需宽化签名（与官方函数签名对齐）
  private readonly rawGetAvailableContextFields: any;

  constructor(manager: EditorManager) {
    super(manager);
    // 弹窗打开必经 manager.getAvailableContextFields。两类故障都在此兜底：
    // ① 官方实现在节点树更新过渡期抛 MST 死节点异常（DataBindingControl 的
    //    catch 显示「加载可用字段失败」）；
    // ② 作用域真空窗口期返回空（顶层「暂无可绑定字段」）。
    // 兜底锚点用 store.activeId 的当前选中节点（活引用）——弹窗必属于当前
    // 选中控件；传入的 node 参数可能是已死亡的面板旧引用。
    const host = manager as unknown as Record<string, unknown>;
    const raw = host['getAvailableContextFields'];
    this.rawGetAvailableContextFields = raw;
    host['getAvailableContextFields'] = async (...args: unknown[]) => {
      let result: unknown;
      try {
        result =
          typeof raw === 'function'
            ? await (raw as (...a: unknown[]) => Promise<unknown>).apply(host, args)
            : undefined;
      } catch {
        // 官方内部状态异常：忽略走兜底
        result = undefined;
      }
      if (result) return result;
      try {
        const store = (
          this.manager as unknown as {
            store?: { activeId?: string; getNodeById?: (id: string) => EditorNodeType };
          }
        ).store;
        const active =
          store?.activeId && store.getNodeById ? store.getNodeById(store.activeId) : undefined;
        const formNode =
          this.findFormAncestor(active) ??
          this.findFormAncestor((args[1] ?? args[0]) as EditorNodeType);
        if (formNode) {
          return this.buildFieldsPanel(formNode, active ?? undefined);
        }
      } catch {
        // 兜底自身遇过渡态异常：放行官方结果（空提示）
      }
      return result;
    };
  }

  /** 沿父链找控件所属的 form 节点。 */
  private findFormAncestor(node: EditorNodeType | undefined | null): EditorNodeType | null {
    let cur = node as unknown as { schema?: Record<string, unknown>; parent?: unknown } | null;
    while (cur) {
      if (cur.schema?.['type'] === 'form') return cur as unknown as EditorNodeType;
      cur = cur.parent as typeof cur;
    }
    return null;
  }

  /**
   * 构建平台字段面板：按对象分组 + 类型兼容软过滤。
   * 结构约定（amis-editor DataBindingControl）：顶层项=分组（label/value/children），
   * children 项选中后 value 写回控件 name、label 联动控件标题。
   */
  private buildFieldsPanel(
    formNode: EditorNodeType,
    target?: EditorNodeType,
  ): Record<string, unknown> {
    const { objectId, fields, objectLabel } = resolveFormFields(formNode);
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
    const groups: BindingPanelGroup[] = [
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

  /** 官方 scope 查找命中 form 时的数据源入口（正常路径）。 */
  override async getAvailableContextFields(
    scopeNode: EditorNodeType,
    target: EditorNodeType,
  ): Promise<Record<string, unknown> | void> {
    return this.buildFieldsPanel(scopeNode, target);
  }

  /** 未绑定对象的 form 回退内置数据域聚合（按画布子控件）。 */
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
