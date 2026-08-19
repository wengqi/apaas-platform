# 条件分支 Bug 彻底修复方案

## 问题复现路径

用户通过画布棱形图标下方的加号按钮添加分支时：
1. 初始状态：2个分支（优先级1 条件成立 + 优先级2 默认分支）
2. 点击画布"+"添加分支后，预期3个分支，实际结果不符合
3. 点击棱形图标打开配置面板，预期3个分支与画布一致，实际只有2个分支

## 根因分析

### Bug A: 画布添加分支后分支数量/显示不正确

flowgram 的 BranchAdder（棱形下方的"+"）创建新 block 时，新 block 被**追加到 `$inlineBlocks$` 末尾**（else block 之后）。`onNodeCreate` 事件触发 `reconcileConditionBranches`，但存在两个问题：

1. **时序问题**：`onNodeCreate` 在新 block 完全集成到树之前触发，`requestAnimationFrame` 延迟可能仍不够
2. **needsRebuild 误判**：如果 `conditions` 数组在 `nodeJSON.data` 创建时已有3个条目（不太可能），或者 extInfo 已被同步，`needsRebuild` 可能返回 false

### Bug B: 配置面板与画布不同步

`reconcileConditionBranches` 在 `needsRebuild=false` 路径中虽然现在添加了 `updateNodeData` 同步，但如果 `needsRebuild=true` 路径中的重建逻辑因时序问题没有正确执行，或者 `onExtInfoChange` 事件没有正确传播到 store，配置面板就看不到新分支。

核心问题：**`onNodeCreate` 中的 `requestAnimationFrame` 延迟不够可靠**，需要改用 `setTimeout` 配合更长延迟，或者使用 flowgram 的 `onNodeUpdate` 事件作为二次同步保障。

## 整改措施

### 修改1: `onNodeCreate` 改用 `setTimeout` + 双重触发

将 `requestAnimationFrame` 改为 `setTimeout(..., 0)` 作为首次同步，并在 `onNodeUpdate` 中保留 `requestAnimationFrame` 作为二次保障。同时确保 `onNodeUpdate` 的 `requestAnimationFrame` 回调中不跳过任何 condition 节点。

### 修改2: `reconcileConditionBranches` 的 `needsRebuild` 逻辑增强

在 `needsRebuild` 检查中增加一个条件：**当 branchBlocks 的物理顺序与 conditions 数组顺序不一致时也触发重建**。具体来说，遍历 branchBlocks，检查每个非 else block 的 title 是否与 conditions 中对应位置的 label 匹配。

### 修改3: `ensureElseBlockLast` 中也同步 conditions 到 store

在 `needsRebuild=false` 的早返回路径中（已有此修复），确保 `updateNodeData` 被调用。但需要增加 **store 与 extInfo 的差异检测**，避免不必要的重复同步。

## 测试用例

| 编号 | 步骤 | 预期结果 |
|---|---|---|
| T1 | 创建条件分支节点 | 画布2分支：优先级1(条件成立)+优先级2(默认分支)，默认在最右 |
| T2 | 点击棱形下方"+"添加分支 | 画布3分支：优先级1+优先级2+优先级3(默认)，默认在最右 |
| T3 | T2后点击棱形打开配置面板 | 面板3分支，与画布完全一致 |
| T4 | 面板"添加分支" | 画布4分支，面板4分支，默认在最右 |
| T5 | 面板删除中间分支 | 画布3分支，面板3分支，条件不错位，默认在最右 |
| T6 | 连续快速添加3个分支 | 不丢分支、不重名、默认始终最右 |
| T7 | 删除到仅剩2分支 | 所有删除按钮disabled |
| T8 | 页面刷新后重新加载 | 画布与面板一致，默认在最右 |

## 修改文件

- `packages/studio/src/components/process/SimplifiedEditor.tsx`
  - `onNodeCreate` handler: `requestAnimationFrame` → `setTimeout(0)` + 额外 `setTimeout(100)` 兜底
  - `reconcileConditionBranches`: `needsRebuild` 增加物理顺序与 conditions 不一致检测
  - `onNodeUpdate` handler: 确保 RAF 回调不跳过 condition 节点

## 验证

1. 本地 `pnpm dev` 测试全部用例
2. 重新构建 Docker 镜像并部署
3. 在 Docker 环境中复测 T1-T8