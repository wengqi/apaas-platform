# 条件分支画布↔配置面板同步缺陷修复方案

## 根因分析

### 缺陷 1：画布添加分支显示"否则"而非"分支 2"
**根因**：flowgram 的 `BranchAdder` 在画布上添加分支时，创建的是一个裸 block（只有 ID，无 data/title/isElse）。`SelectionBridge` 的 reconciliation 逻辑（第 1215 行）用 `i === branchBlocks.length - 1` 判断 else 分支，新 block 被追加到末尾 → 被误判为 else → 显示"否则"。

**修复**：`SelectionBridge` reconciliation 逻辑改为：根据 block 的 `extInfo.isElse` 标志和 ID 中的 `elseBlock` 来判断 else 分支，而非简单地用最后一个位置。重建 conditions 数组时，正确区分 else 分支和新分支的 label。

### 缺陷 2：画布添加的分支不显示在配置面板中
**根因**：`SelectionBridge` 只调用 `n.updateExtInfo({conditions})` 更新 flowgram 节点的 extInfo，然后通过 `exportSchema()` → `onSchemaChange()` → `store.setSchema()` 同步到 store。但 `flowToWorkflowSchema` 的 `flowNodeToWorkflowNode` 函数在序列化时，**extInfo 中的 conditions 可能没有被正确合并到 node.data 中**。需要确认 extInfo → data 的映射关系。

**修复**：在 `SelectionBridge` 的 reconciliation 中，除了 `n.updateExtInfo({conditions})` 之外，也直接更新 flowgram 节点的 data（`n.data.conditions = newConditions`），确保 `flowToWorkflowSchema` 序列化时能正确输出 conditions。同时确保 `blockOrderIcon` 渲染逻辑从 extInfo 读取 conditions 时也能获得最新值。

### 缺陷 3：配置面板添加分支数量不对
**根因**：`ConditionConfigForm.addBranch` 使用 `splice` 在默认分支前插入新分支（conditions 数组 `[A, else]` → `[A, B, else]`），但 `handleNodeDataChange` 只比较 `conditions.length` vs `branchBlocks.length` 来决定添加多少个 block。当 conditions 从 2 变为 3 时，只创建 1 个新 block（正确数量），但创建时用 `i === conditions.length - 1` 判断 else，而 `i=2` 时 `conditions.length-1=2`，新 block 被误判为 else。同时 `doc.addBlock(flowNode, blockJSON)` 不传 index，新 block 被追加到末尾（在 else block 之后），导致顺序混乱。

**修复**：
1. `handleNodeDataChange` 中创建新 block 时，正确判断 isElse（用 conditions 数组中该分支的 condition 是否为 null，而非索引位置）
2. 传 index 参数给 `doc.addBlock`，在 else block 之前插入新 block
3. 创建后重新同步所有 block 的 extInfo（label/isElse/condition），确保顺序一致

### 缺陷 4：画布分支缺少优先级显示和"(未配置)"状态
**根因**：`BlockOrderIconLabel` 组件只渲染 label 和 conditionText，不显示优先级编号。同时当 conditions 数组从 store 读取时可能不同步，导致"(未配置)"不显示。

**修复**：在 `BlockOrderIconLabel` 中添加优先级编号显示（从 blockIndex+1 计算），并确保条件未配置时显示红色"(未配置)"文字。同时"否则"改为"默认分支"。

## 文件变更清单

### 1. `packages/studio/src/components/process/SimplifiedEditor.tsx`

#### 1a. `SelectionBridge` reconciliation 逻辑修复（~第 1211-1223 行）
- 不再用 `i === branchBlocks.length - 1` 判断 else
- 改为：检查 block 的 `extInfo.isElse`、ID 是否含 `elseBlock`、以及 conditions 数组中对应位置是否为 else
- 重建 conditions 时，正确识别 else block（它应该在最后一个位置且 condition 为空），新分支 label 用 `分支 N`
- 新增：调用 `updateNodeData` 将 reconciled conditions 同步到 store

#### 1b. `handleNodeDataChange` addBlock 修复（~第 565-587 行）
- 创建新 block 时，isElse 判断改为 `!cond?.condition && i === conditions.length - 1`（已有但需验证）
- 传 index 参数给 `doc.addBlock`：在 else block 之前插入（`index = branchBlocks.length - 1`）
- 创建后重新同步所有 block 的 extInfo

#### 1c. `blockOrderIcon` 渲染修复（~第 342-385 行）
- isElse 判断改为：`blockExtInfo.isElse` 或 ID 含 `elseBlock`（不再用 `blockIndex === conditions.length - 1`）
- label fallback 中"否则"改为"默认分支"

#### 1d. `BlockOrderIconLabel` 增加优先级显示（~第 186-255 行）
- 添加 `blockIndex` prop
- 渲染优先级标签 `优先级 N`（N = blockIndex + 1）
- "否则"改为"默认分支"
- 确保非 else 且无条件时显示红色"(未配置)"

### 2. `packages/studio/src/components/process/configs/ConditionConfigForm.tsx`
- `isDefaultBranch` 判断改为：`branch.condition === null && index === branches.length - 1`（已有）
- 配置面板中"默认分支"标签确认显示正确（已有）
- 优先级编号确认正确（已有）

### 3. `packages/studio/features/process/simplified/src/schema-serializer.ts`
- 确认 `flowNodeToWorkflowNode` 正确将 extInfo 中的 conditions 合并到 node.data（可能需要修复）

## 验证步骤
1. 画布添加分支 → 新分支显示"分支 2"（非"否则"），优先级正确
2. 画布添加分支 → 配置面板同步显示新分支
3. 配置面板添加分支 → 画布同步显示正确数量的分支
4. 分支标签：非 else 分支显示"分支 N"，else 分支显示"默认分支"
5. 优先级编号：分支1=优先级1, 分支2=优先级2, 默认分支=最低优先级
6. 未配置条件时显示红色"(未配置)"
7. typecheck + test + lint 全部通过