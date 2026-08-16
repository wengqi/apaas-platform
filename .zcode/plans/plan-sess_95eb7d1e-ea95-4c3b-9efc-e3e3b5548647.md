修复 SelectionBridge 中 reconciliation 后 onSchemaChange 覆盖 updateNodeData 的问题：

1. 在 reconciliation 块中设置 `skipSchemaExport = true` 标志
2. 在 `onSchemaChange` 调用前检查该标志，如果为 true 则跳过当轮的 schema 导出（因为 updateNodeData 已经更新了 store）

文件：`packages/studio/src/components/process/SimplifiedEditor.tsx`