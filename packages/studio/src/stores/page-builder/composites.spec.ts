/**
 * 复合组件 store 单测 — 保存（深拷贝重置 ID）/ 删除 / 插入副本。
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { cloneCompositeForInsert, useCompositesStore } from './composites.js';
import type { ComponentNode } from '../../api/pages.js';

function node(id: string, children?: ComponentNode[]): ComponentNode {
  return { id, type: 'text', props: { content: id }, children };
}

describe('复合组件 store', () => {
  beforeEach(() => {
    useCompositesStore.setState({ composites: [] });
  });

  it('saveComposite 深拷贝子树并生成独立 ID', () => {
    const tree = node('orig_root', [node('orig_child')]);
    const id = useCompositesStore.getState().saveComposite('我的复合', tree);
    expect(useCompositesStore.getState().composites).toHaveLength(1);
    const saved = useCompositesStore.getState().composites[0];
    expect(saved?.name).toBe('我的复合');
    // 保存的是结构副本：修改原树不影响已存内容
    tree.id = 'mutated';
    expect(saved?.node.id).not.toBe('mutated');
    void id;
  });

  it('removeComposite 按 id 删除', () => {
    const store = useCompositesStore.getState();
    store.saveComposite('a', node('n1'));
    const cid = store.saveComposite('b', node('n2'));
    expect(useCompositesStore.getState().composites).toHaveLength(2);
    useCompositesStore.getState().removeComposite(cid);
    expect(useCompositesStore.getState().composites.map((c) => c.name)).toEqual(['a']);
  });

  it('cloneCompositeForInsert 全树重置新 ID', () => {
    const tree = node('root_x', [node('child_y')]);
    const clone = cloneCompositeForInsert(tree);
    expect(clone.id).not.toBe('root_x');
    expect(clone.children?.[0]?.id).not.toBe('child_y');
    // 结构保持一致
    expect(clone.children).toHaveLength(1);
  });
});
