/**
 * 审批查看态变换 — 把绑定的 amis 页面 schema 深拷贝为只读形态。
 *
 * 双视角评审（2026-10-04）：审批节点若绑定的是提交表单页，任务中心弹窗原样
 * 渲染会让审批人"再提交一次"（amis form 默认 actions 就是提交按钮）。
 * 渲染端统一只读，绑定页面无需强制改成详情页：
 *  - form → static: true（amis 表单静态展示）+ actions 清除 submit/reset
 *    （显式置空数组，否则 amis 渲染默认提交按钮）
 *  - crud → features 去掉 create（审批场景不允许新增记录）
 * 不修改原 schema（useQuery 缓存共享，必须深拷贝）。
 */

type AmisNode = Record<string, unknown>;

/** 递归下钻的容器键（amis page/tabs/crud/card 常见嵌套位）。 */
const CONTAINER_KEYS = ['body', 'items', 'controls', 'fieldSet', 'tabs'] as const;

/** 静态表单下不允许保留的动作类型。 */
const STRIPPED_ACTION_TYPES = new Set(['submit', 'reset']);

function walk(node: AmisNode): void {
  if (node['type'] === 'form') {
    node['static'] = true;
    const actions = Array.isArray(node['actions']) ? (node['actions'] as AmisNode[]) : [];
    node['actions'] = actions.filter((a) => !STRIPPED_ACTION_TYPES.has(String(a['type'])));
  }
  if (node['type'] === 'crud' && Array.isArray(node['features'])) {
    node['features'] = (node['features'] as unknown[]).filter((f) => f !== 'create');
  }
  for (const key of CONTAINER_KEYS) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object') walk(item as AmisNode);
      }
    } else if (child && typeof child === 'object') {
      walk(child as AmisNode);
    }
  }
}

/** 返回只读化的页面 schema 深拷贝；非 page 根或非法输入原样返回克隆值。 */
export function makeAmisPageReadonly<T>(schema: T): T {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return schema;
  }
  const clone = structuredClone(schema) as AmisNode;
  walk(clone);
  return clone as T;
}
