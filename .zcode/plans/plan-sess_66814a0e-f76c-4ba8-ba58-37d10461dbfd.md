## 修复方案

### 问题诊断

1. **优先级编号**：当前 `BlockOrderIconLabel` 中 `displayIndex + 1` 从 1 开始自增，默认分支最高 → 正确
2. **默认分支位置**：`reconcileConditionBranches` 中 `moveChildNodes` 可能静默失败，但更需要关注的是初始加载时 EventBridge 与 flowgram 的 race condition
3. **配置面板与画布不同步**：根因是 `handleNodeDataChange` 中 `flowNode.updateExtInfo(data)` 没有 `fullUpdate: true`，flowgram 的 `Compare.isChanged(oldInfo, newInfo, depth=1)` 可能因引用相同而跳过 `onExtInfoChange` → `BlockOrderIconLabel` 无法收到渲染通知

### 修复内容

**修改文件**：仅 `packages/studio/src/components/process/SimplifiedEditor.tsx`

**1. `reconcileConditionBranches` 中 condition 节点 `updateExtInfo` 加 `fullUpdate: true`**（第 192 行）
```ts
conditionNode.updateExtInfo({ conditions: newConditions }, true);
```

**2. `handleNodeDataChange` 中 `flowNode.updateExtInfo(data)` 加 `fullUpdate: true`**（约第 764 行）
```ts
flowNode.updateExtInfo(data, true);
```

**3. `BlockOrderIconLabel` 同时订阅 store schema 作为兜底重渲染触发**（约第 366 行后加一行）
```ts
// 兜底：store 变更也触发重渲染（handleNodeDataChange 路径中 updateNodeData 会更新 store）
useProcessEditorStore((s) => s.schema);
```
保留 `useListenEvents` 作为主路径（extInfo 变更时立即渲染），store 订阅作为兜底。由于 `BlockOrderIconLabel` 始终从 flowgram extInfo 读数据而非 store，这两个触发源不会产生数据冲突。

**4. EventBridge 中 `subscribeConditionNode` 的 extInfo→store 同步也加 `fullUpdate` 防抖**（条件节点 extInfo 变化回调中已有 `updateNodeData` 调用，无需额外修改）

### 为什么修复后不会导致循环

- `handleNodeDataChange` 调用 `flowNode.updateExtInfo(data, true)` → 触发 `onExtInfoChange` → EventBridge 的 `subscribeConditionNode` 回调 → 做 `JSON.stringify` 去重比较 → 若一致则跳过 → 若不一致则 `updateNodeData` → 触发 store 更新 → `BlockOrderIconLabel` 重渲染
- 由于 `handleNodeDataChange` 中在 `updateExtInfo` 之前已经调用了 `updateNodeData(id, data)`，store 中已有最新数据，EventBridge 的去重比较会跳过
- 不会循环：`updateExtInfo → onExtInfoChange → updateNodeData → store change → BlockOrderIconLabel re-render → 不调用任何 setter`