# 修复条件分支拖拽不生成分支线

## 问题
`useCreateNode`（服务于左侧拖拽和点击创建）缺少 condition 节点的 `blocks` 初始化逻辑。而 `ApaasAdder.handleSelect`（画布"+"按钮）有这个逻辑。从左侧拖拽条件分支时，`nodeJSON.blocks` 为空，DynamicSplit 的 `onCreate` 收到空数组，不生成 IF/ELSE 分支线。

## 修复
在 `useCreateNode` 的 `createNode` 函数中，复制 `ApaasAdder.handleSelect` 中的 condition 特殊处理：
- `type === 'condition'` 时，设置 `nodeJSON.blocks`（IF/ELSE 两个 block）
- 设置 `nodeJSON.data.conditions`（条件成立/否则）

**文件**: `packages/studio/src/components/process/SimplifiedEditor.tsx`（useCreateNode 函数，约 10 行新增）