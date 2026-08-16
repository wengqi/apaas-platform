# 编码原则：禁止定时器轮询 — 2026-08-16

> 确立「禁止定时器轮询、必须使用事件驱动架构」为项目编码原则，记录前车之鉴与替代方案，
> 并通过 ESLint 约束链自动化拦截。后续所有代码编写必须遵循。

## 一、背景

流程引擎条件分支画布↔配置面板同步功能在初期实现中采用了 `setInterval` 300ms 轮询方案。

- **引入**：commit `735f9b2`（2026-08-01）— 为修复 SimplifiedEditor 中 flowgram 画布选中状态同步问题，使用 `setInterval(() => { ... }, 300)` 周期性扫描画布选中和节点数据
- **持续迭代**：2026-08-16 条件分支系列修复（commit `83bda37` 等）期间发现轮询方案的根本性缺陷
- **替代**：2026-08-16 重构为 `EventBridge` 事件驱动架构，使用 flowgram 原生事件 API 替代轮询

## 二、定时器轮询的危害

| # | 危害 | 说明 |
|---|------|------|
| 1 | 持续 CPU 开销 | 轮询无论是否有状态变化都会执行，造成不必要的周期性全量扫描与对象创建 |
| 2 | 状态不一致窗口 | 轮询间隔内（如 300ms）的状态变化无法被感知，用户操作与 UI 同步之间存在延迟 |
| 3 | 调试困难 | 轮询回调的触发与实际状态变化无因果关系，难以通过调用栈定位问题根源 |
| 4 | 违反事件驱动架构 | flowgram 等框架已提供原生事件 API，轮询是对事件驱动模型的倒退 |

## 三、修复方案：EventBridge 事件驱动架构

`EventBridge` 组件（`packages/studio/src/components/process/SimplifiedEditor.tsx`）使用 flowgram 原生事件 API 替代轮询：

| 原轮询职责 | EventBridge 事件 API | 行为 |
|-----------|----------------------|------|
| 选中状态同步 | `ctx.selection.onSelectionChanged` | 选中变化时立即同步，无防抖 |
| 条件分支创建感知 | `ctx.document.onNodeCreate` | 节点创建时立即订阅 + `reconcileConditionBranches` |
| 条件分支删除感知 | `ctx.document.onNodeDispose` | 节点删除时立即触发父 condition 重建 |
| extInfo→store 同步 | `node.onExtInfoChange` | per condition node 订阅，带 `JSON.stringify` 去重 |
| 节点更新感知 | `ctx.document.onNodeUpdate` | else block 物理位置检查 + 防抖导出 |
| schema 导出 | 上述所有事件 → `scheduleExport` | 50ms `setTimeout` 防抖批量处理 |

关键设计要点：

- **`DisposableCollection`**：所有事件订阅统一收集，组件卸载时 `dispose()` 清理，避免内存泄漏
- **50ms `setTimeout` 防抖**：连续事件触发时合并为一次 schema 导出——这是 `setTimeout` 用于 debounce 的合法用法，非轮询
- **`JSON.stringify` 去重**：导出和 extInfo 同步均通过签名比对避免重复更新
- **`requestAnimationFrame` 延迟**：`onNodeCreate`/`onNodeUpdate` 中涉及 flowgram 内部布局的操作延迟到下一帧执行，避免在事务中嵌套修改

## 四、编码原则（固化为项目约束）

> **禁止使用定时器轮询**（`setInterval`、`setTimeout` 递归自调用循环）作为状态同步、数据刷新或事件监听的实现方式。
>
> **必须使用事件驱动架构替代**：框架原生事件 API、Pub/Sub、WebSocket、React Query 事件订阅等。

### 允许的例外

| 场景 | 说明 |
|------|------|
| `setTimeout` debounce/defer | 单次延迟调用用于防抖（如 schema 导出 50ms 防抖）、表单 reset 延迟等。**不是**递归自调用循环 |
| React Query `refetchInterval` | 仅在确实需要周期性数据刷新时使用，需在 PR 中说明必要性 |

### ESLint 自动化拦截

`eslint.config.mjs` 已新增 `no-restricted-syntax` 规则（`error` 级），拦截：

- 裸 `setInterval(...)` 调用 — selector: `CallExpression[callee.name='setInterval']`
- `*.setInterval(...)` 调用（`window.setInterval` / `globalThis.setInterval` 等）— selector: `CallExpression[callee.property.name='setInterval']`

配合现有约束链（`--max-warnings 0` + pre-commit lint-staged + pre-push typecheck/test），在提交阶段即拦截违规代码。`setTimeout` 不受此规则限制。

## 五、教训

1. **轮询是技术债的起点**：在框架已提供事件 API 的情况下使用轮询，不仅低效还掩盖了真实的事件流。新功能开发前应先调研框架能力，优先使用事件驱动方案。
2. **约束链应覆盖编码原则**：人工记忆不可靠，编码原则必须由工具（ESLint/husky/CI）强制执行。本原则从发现到固化为 ESLint 规则，确保同类问题不再复发。
3. **区分轮询与防抖**：`setInterval` 周期执行 vs `setTimeout` 单次延迟是本质区别。规则拦截 `setInterval` 而非 `setTimeout`，精确覆盖反模式而不影响合法用法。

## 六、相关文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `AGENTS.md` | 修改 | 编码规范新增「实时性与事件驱动（禁止定时器轮询）」小节 |
| `eslint.config.mjs` | 修改 | 新增 `no-restricted-syntax` 规则拦截 `setInterval` 调用 |
| `packages/studio/src/components/process/SimplifiedEditor.tsx` | 参考 | `EventBridge` 事件驱动实现（替代原 300ms 轮询的 `SelectionBridge`） |
