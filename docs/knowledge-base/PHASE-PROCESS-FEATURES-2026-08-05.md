# 流程引擎三大功能实现记录 — 2026-08-05

> 本文档记录流程引擎三个核心功能的实现过程、架构决策和关键 bug 修复。
> 对应提交：`33129f7`、`d49c098`、`5f1f941`、`beb3b60`、`a921e63`

---

## 一、功能清单

| # | 功能 | 架构模式 | 提交 |
|---|------|---------|------|
| 1 | 流程监控（终止能力 + 权限加固） | 前端补全 + 后端权限装饰器 | `33129f7` |
| 2 | 抄送（审批节点内置） | 节点配置扩展 + 引擎注入 | `d49c098` |
| 3 | 条件表达式 UI（混合模式） | expr-eval + 双模式编辑器 | `5f1f941` |

---

## 二、功能 1: 流程监控 — 终止能力

### 背景
后端 `cancelProcess` / `cancelInstance` / `listInstances` 全部实现，前端 API client `processesApi.cancelInstance` 已封装，但 `ProcessMonitor.tsx` 从未调用 — **缺少"终止"按钮 UI 入口**。

### 实现
- **ProcessMonitor.tsx**: 新增 `cancelInstanceMutation`，在实例列表操作列追加 `<Popconfirm>` + "终止"按钮
  - 显示条件：`r.state === 'running' || r.state === 'waiting'`（未终态时显示）
  - 确认弹窗文案："终止后所有待办任务将被取消，不可恢复。"
- **process.controller.ts**: `cancelInstance` 端点补充 `@RequirePermission('PROCESS', 'EXECUTE')`，与 `startInstance`/`deleteProcess` 权限治理一致

### 关键 Bug 修复：实例状态字段映射
**问题**：后端 `toInstanceDto` 返回 `status: 'WAITING_USER_TASK'`（Prisma 枚举），前端 `ProcessInstance` 接口期望 `state: 'waiting'`（小写枚举）。字段名和值均不匹配，导致：
- `r.state` 恒为 `undefined`
- `getInstanceStateMeta(state)` 回退到 `pending` → "等待中"（恰好和 `waiting` 显示一样，掩盖了 bug）
- 终止/处理按钮条件判断 `r.state === 'waiting'` 恒为 `false`

**修复**：`toInstanceDto` 新增 `mapInstanceState` 方法 + 补充 `processKey`/`version`/`startTime`/`endTime`/`triggeredBy` 等前端期望字段：
```ts
private mapInstanceState(status: string): string {
  const map: Record<string, string> = {
    PENDING: 'pending', RUNNING: 'running',
    WAITING_USER_TASK: 'waiting', COMPLETED: 'completed',
    FAILED: 'failed', TERMINATED: 'terminated', CANCELLED: 'cancelled',
  };
  return map[status] ?? 'pending';
}
```

### 测试结果
✅ 浏览器验证 — 终止按钮 → 确认弹窗 → 实例状态变为"已终止" → 列表自动刷新

---

## 三、功能 2: 抄送 — 审批节点内置

### 架构决策
用户选择 **审批节点内置抄送**（而非独立抄送节点），理由：最贴合飞书/钉钉审批流的「审批后抄送」语义，无需额外画节点。

### 设计
- **触发时机**：`onApprove`（通过时）/ `onReject`（驳回时）/ `onComplete`（完成时）
- **抄送人类型**：`USER`（直接用户ID）/ `ROLE`（角色ID）/ `ORG`（组织ID）
- **通知渠道**：站内信（复用 `InAppMessageService`）

### 实现
1. **shared 类型** (`packages/shared/src/process/index.ts`):
   - `CcConfig` / `CcTrigger` / `CcAssigneeType` 类型定义
2. **前端表单** (`UserTaskConfigForm.tsx`):
   - 在"驳回配置"后新增"抄送配置"区域
   - Switch 开关 + Select 类型 + Select(tags) 目标ID + Select 触发时机
3. **引擎逻辑** (`process-engine.ts`):
   - `ProcessEngine` 构造函数注入 `InAppMessageService`（从 `NotificationModule` 导入）
   - 新增 `resolveCcRecipients` 方法：USER 直接返回，ROLE 查 `UserRole` 连接表展开，ORG 查 `OrgMember` 连接表展开
   - 新增 `sendCcNotification` 方法：从节点 `data` 读取抄送配置，按触发时机判断，发送站内信
   - **通知发送失败不阻塞流程**（try-catch + warn 日志）

### 关键 Bug 修复：审批决策值映射
**问题**：前端 API 发送 `decision: "approve"`，`completeTask` 中 `decisionUpper = "APPROVE"`，但代码比较 `=== 'APPROVED'` → 永远不匹配。导致：
- `taskStatus` 恒为 `DELEGATED`（而非 `APPROVED`）
- CC 触发条件 `ccTrigger === 'onApprove' && decisionUpper === 'APPROVED'` 恒为 `false`
- 驳回逻辑 `decisionUpper === 'REJECTED'` 也失效

**修复**：引入 `isApproved` / `isRejected` 标志，兼容 `approve`/`approved` 和 `reject`/`rejected` 两种写法：
```ts
const isApproved = decisionUpper === 'APPROVED' || decisionUpper === 'APPROVE';
const isRejected = decisionUpper === 'REJECTED' || decisionUpper === 'REJECT';
```
同步修复 `sendCcNotification`、驳回逻辑、`taskStatus` 映射。

### 测试结果
✅ API 验证 — 审批通过后 → 抄送人收到站内信「审批抄送通知」→ 内容包含流程名、节点名、决策结果、审批意见

---

## 四、功能 3: 条件表达式 UI — 混合模式

### 架构决策
用户选择 **混合模式**（可视化 + 表达式 Tab 切换），兼顾易用性和灵活性。

### expr-eval 语法关键发现
expr-eval v2 的语法与预期不同，需要特别注意：
- 逻辑运算符为**小写** `and` / `or`（**非** `&&` / `||` / `AND` / `OR`）
- 字符串值用**双引号**包裹：`status == "urgent"`
- 比较运算符：`>` `<` `>=` `<=` `==` `!=`
- 括号 `()` 可解析但复杂嵌套无法可视化
- 变量名仅支持 `\w+`（字母数字下划线），不支持点号 `.` 访问嵌套属性

### 实现
1. **依赖** (`packages/studio/package.json`): 新增 `expr-eval: ^2.0.2`
2. **转换工具** (`expression-utils.ts`, 新建):
   - `visualToExpression`: 可视化结构 → 表达式字符串
   - `expressionToVisual`: 表达式 → 可视化结构（best-effort，含括号/混合AND/OR 返回 null）
   - `validateExpression`: expr-eval 实时语法校验
   - `OPERATOR_OPTIONS` / `COMBINER_OPTIONS` 常量
3. **表单重写** (`ConditionConfigForm.tsx`):
   - Tab 切换「可视化」和「表达式」
   - 可视化：字段 Input + 运算符 Select + 值 Input + 类型 Radio(数字/文本) + AND/OR 组合
   - 表达式：TextArea + 实时语法校验（✓ 语法正确 / ✗ 错误信息）
   - 底层存储统一为表达式字符串，双模式可互转
   - 无法可视化的表达式自动回退到表达式模式

### 测试结果
✅ 11 项单元测试全部通过：
- visualToExpression / expressionToVisual 双向转换
- Round-trip 数据一致性
- 单条件 / AND / OR 组合
- 括号 → null（回退）
- 混合 AND/OR → null（回退）
- 语法校验（合法/非法/空）
- expr-eval 求值验证

---

## 五、流程引擎变量体系调研结论

> 本节为条件表达式变量选择器设计而进行的变量体系调研，记录关键结论供后续开发参考。

### 变量作用域构建（`buildEvalScope`）

条件表达式求值时使用**扁平化作用域**，由 `apps/gateway/src/process/process-utils.ts` 中的 `buildEvalScope` 构建：

1. **全局变量** `variables.global` 的所有顶层字段（由 `assign` / `object_operation` query / `http_request` responseMapping 写入），优先级最高。
2. **所有节点的 output 扁平化**：遍历 `variables` 中每个非 `global` 的键，若该键的值含有 `output` 子对象，则把 `output` 的顶层字段拍平到作用域。

因此条件表达式里**直接用字段名引用**（如 `amount > 1000`、`decision == "APPROVED"`），而非点分路径。

### 变量写入结构（`writeNodeOutput`）

节点输出写入结构为 **`variables[nodeId] = { output }`**（嵌套，非扁平）。`buildEvalScope` 会把 `nodeId.output` 拍平，所以条件表达式里可直接写 `decision == "APPROVED"`。

### 各节点类型输出字段

| 执行器 | type | output 结构 |
|---|---|---|
| start | `start` | `{ ...ctx.inputs }` — 流程入参 |
| trigger | `trigger` | `{ ...triggerContext }` — recordId/record/triggeredByUser/eventType |
| user_task | `user_task` | completeTask 后：`{ decision, comment, formData, assignee }` |
| object_operation | `object_operation` | create:`{recordId, record}` / query:`{records, record, count}` |
| http_request | `http_request` | `{ statusCode, responseBody, success }` |
| notification | `notification` | `{ messageId, success, channel, recipients, title }` |
| delay | `delay` | `{ delayedMs }` |
| assign | `assign` | `{ variableName, value }` + 额外写 `global[variableName]` |
| condition | `condition` | 无 output（仅返回 nextNodeIds） |

### 关键注意事项

1. **条件表达式 vs ref/template 路径不一致**：条件表达式用扁平字段名（`buildEvalScope` 拍平），ref 用嵌套路径（`nodeId.output.field`），template 用点分路径（`{{ nodeId.output.field }}`）。
2. **顶层裸字段不进入条件作用域**：startProcess 把 triggerContext 裸展开到 variables 顶层，但这些字段无 `output` 包裹，`buildEvalScope` 不采纳。只有 trigger 节点执行后（`trigger_x.output.*`）才进入条件作用域。
3. **前端变量选择器形同虚设**：`VariablePicker.tsx` 有组件骨架但候选是静态硬编码，`FlowValueEditor` 默认传空 `[]`，仅 `AssignConfigForm` 接入。条件配置用的是手写文本框。
4. **flowgram variable plugin 装而不用**：依赖已安装但未接入，自研 IFlowValue 四态 + buildEvalScope 体系。

---

## 六、架构经验总结

### 6.1 前后端契约对齐
本次发现两个前后端契约不一致 bug：
1. **状态字段映射**：后端返回 `status`（大写 Prisma 枚举），前端期望 `state`（小写枚举）
2. **决策值映射**：前端发送 `approve`，后端比较 `APPROVED`

**教训**：跨层类型契约必须在一处定义（`packages/shared`），后端 DTO 层必须做字段映射，不能直接暴露 Prisma 枚举值。

### 6.2 flowgram.ai 画布的浏览器自动化限制
flowgram Fixed Layout 引擎的画布节点**无法通过 Playwright/CUA 点击触发选择**。原因：
- 节点渲染在分层 canvas 容器中，指针事件被拦截
- flowgram 有自己的事件系统，不响应原生 DOM click
- `SelectionBridge` 通过 `ctx.selection` 轮询获取选中状态

**影响**：无法通过浏览器自动化测试流程编辑器中的节点配置面板。需要通过 API 测试或单元测试覆盖。

### 6.3 抄送通知的容错设计
抄送通知采用 **fire-and-forget** 模式：
- `sendCcNotification` 包裹在 try-catch 中
- 失败仅记 warn 日志，不阻塞流程执行
- 这与飞书 aPaaS 的设计一致 — 通知是辅助功能，不应影响主流程

### 6.4 expr-eval 语法注意事项
- 使用小写 `and`/`or`，不是 `&&`/`||`/`AND`/`OR`
- 字符串用双引号 `"value"`，单引号也可但非标准
- 变量名仅支持 `\w+`（字母数字下划线），不支持点号 `.` 访问嵌套属性
- 前端生成的表达式必须与后端 `process-utils.ts` 中的 `evaluateCondition` 语法一致

---

## 七、涉及文件清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `packages/studio/src/components/process/ProcessMonitor.tsx` | 修改 | 新增终止按钮 + cancelInstanceMutation |
| `apps/gateway/src/process/process.controller.ts` | 修改 | cancelInstance 补充权限装饰器 |
| `apps/gateway/src/process/process.service.ts` | 修改 | toInstanceDto 状态映射修复 |
| `packages/shared/src/process/index.ts` | 修改 | 新增 CcConfig / CcTrigger / CcAssigneeType |
| `packages/studio/src/components/process/configs/UserTaskConfigForm.tsx` | 修改 | 新增抄送配置区域 |
| `apps/gateway/src/process/process-engine.ts` | 修改 | 注入 InAppMessageService + 抄送逻辑 + 决策值修复 |
| `packages/studio/package.json` | 修改 | 新增 expr-eval 依赖 |
| `packages/studio/src/components/process/configs/expression-utils.ts` | **新建** | 表达式转换工具 |
| `packages/studio/src/components/process/configs/ConditionConfigForm.tsx` | 重写 | 混合模式编辑器 |
