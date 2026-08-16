## 修复方案

### 问题根因

`ConditionEditor` 组件在挂载时通过 lazy `useState` 初始化 `tree` 和 `exprText` 状态，之后不再从 `condition` prop 重新同步。分支列表的 wrapper div 使用 `key={index}`，当删除分支 1 后，分支 2 和分支 3 的索引前移，React 复用旧的 `ConditionEditor` 实例，导致分支 2 的编辑器显示的是已删除分支 1 的规则。

### 修复内容（仅修改 `ConditionConfigForm.tsx`）

1. **给 `ConditionBranchItem` 添加 `id` 字段**（可选字段，string 类型），作为分支的唯一标识。

2. **在 `addBranch` 中为新分支生成唯一 ID**（使用 `crypto.randomUUID()` 或 `Date.now() + Math.random()`）。初始的 conditions 数组（来自 Adder/SelectionBridge 创建的分支）没有 `id`，在渲染时为缺失 `id` 的分支自动生成并补全。

3. **将 wrapper div 的 `key={index}` 改为 `key={branch.id || index}`**，确保删除分支后 React 不会复用错误的编辑器实例。

4. **在 `ConditionEditor` 中添加 `useEffect`**，当 `condition` prop 变化时重新同步 `tree` 和 `exprText` 状态。这是双重保险：即使 key 相同（例如两个分支都从 null 变为有值），也能确保内部状态正确更新。

### 修改文件
- `packages/studio/src/components/process/configs/ConditionConfigForm.tsx`
  - 添加 `import { useEffect }` 
  - `ConditionBranchItem` 接口添加 `id?: string`
  - `addBranch` 生成唯一 ID
  - 渲染时为缺失 ID 的分支自动生成 ID
  - `key={index}` → `key={branch.id ?? `branch-${index}`}`
  - `ConditionEditor` 添加 `useEffect` 同步 `condition` 变化到 `tree`/`exprText`

### 测试验证
1. 创建新流程，添加条件分支，添加 3 个分支（共 5 个）
2. 给分支 2 添加一条 rule
3. 删除分支 1
4. 验证：分支 2（原分支 2）仍保留其 rule，分支 3 不被错误配置
5. 验证画布与配置面板一致