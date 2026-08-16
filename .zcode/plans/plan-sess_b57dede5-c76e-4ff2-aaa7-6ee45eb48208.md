# 修复条件分支两个 Bug

## Bug 1: 默认分支排序不在最右边

**根因**: `BlockOrderIconLabel` 组件通过遍历物理 block 树计算 `nonElseIndex`，但 flowgram 的 BranchAdder 将新 block 追加到末尾，导致 else block 的物理位置在中间。虽然 `moveChildNodes` 尝试重排，但该 API 在事件回调中不可靠（requestAnimationFrame 延迟也不够）。

**修复**: `BlockOrderIconLabel` 不再依赖物理 block 位置计算优先级。改为从权威的 `conditions` 数组中通过 label 匹配查找当前 block 的位置。conditions 数组始终是非 else 在前、else 在末尾，所以优先级显示正确，不受物理位置影响。物理重排逻辑保留（`ensureElseBlockLast`），但即使物理重排失败，优先级标签和数据显示也是正确的。

## Bug 2: 画布与配置面板数据不同步

**根因**: 当通过画布 BranchAdder 添加分支时，`reconcileConditionBranches` 的 `needsRebuild` 检查可能因为时序问题（conditions 已从 nodeJSON.data 同步到 extInfo）返回 false，导致不重建 conditions 数组、不同步到 store。

**修复**: 在 `ensureElseBlockLast` 函数中（即 `needsRebuild=false` 的早返回路径），也调用 `updateNodeData` 将 extInfo 中的 conditions 同步到 Zustand store，确保配置面板始终与画布一致。

## 修改文件

- `packages/studio/src/components/process/SimplifiedEditor.tsx`
  - `BlockOrderIconLabel` 函数：重写优先级计算逻辑，从 conditions 数组按 label 匹配
  - `reconcileConditionBranches` 函数的 `ensureElseBlockLast`：添加 store 同步

## 验证

1. 重新构建 Docker 镜像
2. 在浏览器中测试：添加条件分支节点 → 通过画布"+"添加分支 → 验证默认分支在最右侧、优先级正确、配置面板与画布同步