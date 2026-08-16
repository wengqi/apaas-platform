# 修复画布优先级编号重复问题

## 根因
`blockOrderIcon` 渲染时用 `conditions.findIndex(c => c.label === label)` 计算优先级编号。但 label 可能重复（如两个"分支 5"），`findIndex` 只返回第一个匹配，导致重复编号。

## 修复方案
在 `SelectionBridge` reconciliation 和 `handleNodeDataChange` block 同步中，给每个 block 的 extInfo 写入 `priorityIndex` 字段（该 block 在 conditions 数组中的位置）。`blockOrderIcon` 渲染时直接读取 `blockExtInfo.priorityIndex`，不再依赖 label 匹配。

### 改动点

1. **`SelectionBridge` reconciliation（~第 1428 行）**：在 `branchBlocks.forEach` 循环中，为每个 block 设置 `priorityIndex`
   - 非 else block：`priorityIndex = nonElseIdx`（在 nonElse 中的序号）
   - else block：`priorityIndex = newConditions.length - 1`

2. **`handleNodeDataChange` block 同步（~第 750 行）**：在同步 block extInfo 时也设置 `priorityIndex`
   - 非 else block：`priorityIndex = nonElseCounter - 1`（自增后的值减 1）
   - else block：`priorityIndex = conditions.length - 1`

3. **`blockOrderIcon` 渲染（~第 409 行）**：改为优先读取 `blockExtInfo.priorityIndex`，找不到时才用 label 匹配兜底

### 文件
`packages/studio/src/components/process/SimplifiedEditor.tsx`