# 条件分支点击选中

## 问题
条件分支的菱形图标（blockIcon）没有 onClick，点击无法选中 condition 节点，只能框选。

## 修复
在 `SimplifiedEditor.tsx` 的 `blockIcon` 渲染中添加 `onClick`：
- 通过 `ctx.document.getNode(node.id)` 获取 blockIcon 的 flowNode
- 通过 `flowNode.originParent` 获取父 condition 节点
- 设置 `ctx.selection.selection = [conditionNode]` 选中它
- 添加 `cursor: pointer` 样式

**文件**: `packages/studio/src/components/process/SimplifiedEditor.tsx`（blockIcon 渲染，约 5 行改动）