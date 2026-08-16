# 条件分支画布缺陷修复方案

## Bug 1：分支标签文字换行（样式问题）

**根因**：`BlockOrderIconLabel` 组件（SimplifiedEditor.tsx 第 227-255 行）的外层 div 设置了 `maxWidth: 200` 但没有 `whiteSpace: 'nowrap'`，内层 flex 行也没有 `flexWrap: 'nowrap'` 和 `overflow: 'hidden'`。当"优先级 N" + 标签 + 条件文本总宽度超过 200px 时，文字换行。

**修复**：在 `BlockOrderIconLabel` 的内层 flex 行（第 242 行）添加：
- `whiteSpace: 'nowrap'` — 防止文字换行
- `overflow: 'hidden'` — 超出部分隐藏
- `textOverflow: 'ellipsis'` — 超出部分显示省略号
- 给 label span 添加 `overflow: 'hidden'` 和 `textOverflow: 'ellipsis'`

**文件**：`packages/studio/src/components/process/SimplifiedEditor.tsx` 第 242-255 行

## Bug 2：默认分支不在最右边

**根因**：flowgram 的 `BranchAdder`（画布上的加号按钮）调用 `addBlock(node, { id })` 不传 index，新 block 被追加到 `$inlineBlocks$` 末尾（在 else block 之后）。`SelectionBridge` 的 reconciliation 只重排了逻辑 `conditions` 数组和 block 的 extInfo（title/isElse），但没有移动 block 的物理位置。画布的左右排列由 block 的物理顺序决定，所以 else block 不在最右边。

**修复**：在 `SelectionBridge` 的 reconciliation 中，当检测到 else block 不在物理末尾时，使用 flowgram 的 `moveChildNodes` API 将 else block 移动到 `$inlineBlocks$` 的最后位置。

具体改动（`SelectionBridge` reconciliation，第 1330-1405 行）：
1. 在 `needsRebuild` 检查中增加条件：else block 不在 branchBlocks 的物理末尾
2. 在 reconciliation 逻辑中，重建 conditions 数组后，检查 else block 的物理位置
3. 如果 else block 不在末尾，调用 `ctx.operation.moveChildNodes({ toParentId: inlineBlocksId, toIndex: branchBlocks.length - 1, nodeIds: [elseBlockId] })` 将其移动到末尾
4. 同时如果有多个 else block，只保留第一个，删除其余的

**文件**：`packages/studio/src/components/process/SimplifiedEditor.tsx` 第 1310-1405 行

## 验证步骤
1. 画布添加分支 → 新分支标签单行显示
2. 画布添加分支 → 默认分支始终在最右边
3. 配置面板添加分支 → 画布默认分支在最右边
4. typecheck + lint 通过