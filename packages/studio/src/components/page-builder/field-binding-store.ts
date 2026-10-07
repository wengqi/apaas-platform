/**
 * 绑定对象字段缓存（模块级 store，框架无关）。
 *
 * 生命周期：PageBuilder 在页面 schema 的 data.objectId 变化时拉取对象字段并写入；
 * FieldBindingPanelPlugin 的面板组件经 useSyncExternalStore 订阅（快照整体换引用，
 * 保证 getSnapshot 引用稳定，避免无限重渲染）。
 */

export interface BoundObjectField {
  apiName: string;
  label: string;
}

export interface BoundObjectSnapshot {
  /** 当前页面绑定的对象 ID；null = 页面未绑定对象（如自定义页） */
  objectId: string | null;
  fields: readonly BoundObjectField[];
}

let snapshot: BoundObjectSnapshot = { objectId: null, fields: [] };
const listeners = new Set<() => void>();

export function setBoundObjectFields(objectId: string | null, fields: BoundObjectField[]): void {
  snapshot = { objectId, fields };
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
