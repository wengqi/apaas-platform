# 代码审查结果 + 修复计划

## 审查发现

### 1. block ID `$` 前缀问题（已修复）
- `$ifBlock$` → `ifBlock_` 已修复
- flowgram `toNodeJSON` 跳过以 `$` 开头的节点，导致 block 被丢失
- `addBlock` 内部使用 `$blockOrderIcon$${blockData.id}` 生成子节点 ID，不受 block ID 前缀影响

### 2. `useFindDropAnchor` 坐标转换问题（需修复）
- `getRelativePos` 返回的坐标可能与 `bounds.center.y` 不在同一坐标系
- 回退逻辑（直接用 `clientY`）会导致位置完全错误
- 修复：当 `getRelativePos` 不可用时，回退到"追加到最后一个非 end 节点"而非用错误的坐标
- 排除 `end` 节点作为锚点（否则节点会插入到 end 之后）

### 3. 序列化器 `flowNodeToWorkflowNode` 已简化（已修复）
- 移除了不必要的 `inlineBlocks` 提升逻辑
- flowgram 的 `toNodeJSON` 已处理系统节点跳过

## 修复文件
- `SimplifiedEditor.tsx` — `useFindDropAnchor` 改进回退逻辑 + 排除 end 节点