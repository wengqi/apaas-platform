/**
 * 绑定对象字段缓存（模块级 store，框架无关）。
 *
 * v2（多表支持）：一个页面可含多个 form、各自绑定不同对象（form.api.url 指向
 * 各自对象），缓存按 objectId 分桶。生命周期：PageBuilder 在页面 schema 变化时
 * 解析全部 form 的绑定对象并经 React Query（qk.object）拉取后整体写入；编辑器
 * ApaasFormPlugin 的字段选择器（原生感叹号弹窗）同步读取消费。快照整体换引用，
 * 保证 getSnapshot 引用稳定，避免 useSyncExternalStore 无限重渲染。
 */

export interface BoundObjectField {
  apiName: string;
  label: string;
}

export interface BoundObjectSnapshot {
  /** objectId → 该对象字段列表（页面内全部已解析的绑定对象） */
  objects: Readonly<Record<string, readonly BoundObjectField[]>>;
}

const EMPTY: BoundObjectSnapshot = { objects: {} };
let snapshot: BoundObjectSnapshot = EMPTY;
const listeners = new Set<() => void>();

/** 整体替换页面内各绑定对象的字段缓存。 */
export function setBoundObjectObjects(objects: Record<string, readonly BoundObjectField[]>): void {
  snapshot = { objects };
  for (const listener of listeners) listener();
}

/** 清空缓存（页面切换/卸载时防跨页残留）。 */
export function clearBoundObjectObjects(): void {
  snapshot = EMPTY;
  for (const listener of listeners) listener();
}

export function getBoundObjectSnapshot(): BoundObjectSnapshot {
  return snapshot;
}

export function subscribeBoundObject(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
