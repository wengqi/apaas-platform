# 修复延时节点下拉选择始终显示"小时"

## 根因
`processEditor.ts` store 的 `updateNodeData` 方法有两个问题：

1. **只搜索顶层节点**：`schema.nodes.find(n => n.id === nodeId)` 不递归搜索嵌套在 condition blocks 内的节点。如果延时节点在条件分支内，`find` 返回 `undefined`，`node.data` 不更新。

2. **未找到节点时仍覆盖 schema**：即使 `find` 失败（`node` 为 `undefined`），方法仍返回 `{ schema: deepClone(state.schema), ... }`，用旧数据覆盖 store。这导致表单短暂回退到旧值（"小时"），直到 300ms 后 SelectionBridge 重新导出才修正。

## 修复
**文件**: `packages/studio/src/stores/processEditor.ts`

1. `updateNodeData` 递归搜索节点（支持嵌套在 blocks 内的节点）
2. 未找到节点时不更新 schema（返回 `{}`），避免覆盖

```ts
updateNodeData: (nodeId, data) =>
  set((state) => {
    if (!state.schema) return {};
    const schema = deepClone(state.schema);
    // 递归搜索节点（含嵌套在 condition blocks 内的节点）
    const findAndUpdate = (nodes: WorkflowNode[]): boolean => {
      for (const n of nodes) {
        if (n.id === nodeId) {
          n.data = { ...n.data, ...data };
          return true;
        }
        if (n.blocks) {
          if (findAndUpdate(n.blocks)) return true;
        }
      }
      return false;
    };
    if (!findAndUpdate(schema.nodes)) return {}; // 未找到不覆盖
    return { schema, past: [...], future: [], dirty: true };
  }),
```