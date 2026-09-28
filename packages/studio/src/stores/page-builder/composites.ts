/**
 * 复合组件 store — 用户把画布选中子树保存为可复用组合（对齐飞书「自定义」物料页签）。
 *
 * 持久化到 localStorage（key 含 tenant/user 无关，页面搭建器本地草稿语义），
 * 拖入画布时经 insertSubtree 深拷贝出新 ID，避免跨页 ID 冲突。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ComponentNode } from '../../api/pages.js';
import { deepCloneWithNewIds } from './utils.js';

/** 一个复合组件 = 名称 + 子树模板。 */
export interface CompositeItem {
  id: string;
  name: string;
  node: ComponentNode;
}

const MAX_COMPOSITES = 50;

interface CompositesState {
  composites: CompositeItem[];
  /** 保存子树为复合组件（深拷贝并重置 ID）。 */
  saveComposite: (name: string, node: ComponentNode) => string;
  removeComposite: (id: string) => void;
}

const STORAGE_KEY = 'apaas-page-builder-composites';

export const useCompositesStore = create<CompositesState>()(
  persist(
    (set) => ({
      composites: [],
      saveComposite: (name, node) => {
        const id = `comp_${Math.random().toString(36).slice(2, 10)}`;
        set((s) => ({
          composites: [
            ...s.composites.slice(-(MAX_COMPOSITES - 1)),
            { id, name, node: structuredClone(node) },
          ],
        }));
        return id;
      },
      removeComposite: (id) =>
        set((s) => ({ composites: s.composites.filter((c) => c.id !== id) })),
    }),
    { name: STORAGE_KEY },
  ),
);

/**
 * 取复合组件的可插入副本：深拷贝 + 全树重置新 ID。
 * （deepCloneWithNewIds 来自搭建器 utils，与 duplicateNode 同源语义。）
 */
export function cloneCompositeForInsert(node: ComponentNode): ComponentNode {
  return deepCloneWithNewIds(node);
}
