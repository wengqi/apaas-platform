# 条件表达式重构方案 — react-awesome-query-builder + JsonLogic + CodeMirror

## 架构评审摘要

### 核心决策
1. **存储格式**：从 expr-eval 字符串切换为 **JsonLogic JSON**（标准、可序列化、跨语言）
2. **可视化模式**：react-awesome-query-builder（Ant Design 主题，原生 JsonLogic 导出/导入）
3. **表达式模式**：CodeMirror 6 编辑器 + 自动补全（变量名/运算符/函数提示）
4. **后端求值**：json-logic-js 替代 expr-eval（`jsonLogic.apply(rule, data)`）

### 数据流

```
可视化模式:
  react-awesome-query-builder JSON → Utils.jsonLogicFormat() → JsonLogic JSON → 存储

表达式模式:
  CodeMirror 编辑文本 → 自定义解析器 → JsonLogic JSON → 存储
  CodeMirror 加载 ← JsonLogic → 自定义格式化器 ← 读取

后端求值:
  JsonLogic JSON → jsonLogic.apply(rule, buildEvalScope(variables)) → boolean
```

---

## 改动清单（6 个文件新建/重写 + 4 个文件修改 + 知识库）

### 第一部分：知识库沉淀

在实施前，将以下上下文知识写入 `docs/knowledge-base/CONDITION-EXPRESSION-REFACTOR-2026-08-05.md`：
- 现有条件表达式体系的问题（扁平化限制、contains 未注册、两套变量体系割裂）
- react-awesome-query-builder 适配性评估（Immutable.js 摩擦、AntD 兼容、运算符映射）
- JsonLogic 格式选型理由（标准格式、跨语言、可序列化、安全无 eval）
- CodeMirror 6 自动补全方案
- 更新 `docs/knowledge-base/README.md` 索引

### 第二部分：依赖安装

**`packages/studio/package.json`** — 新增依赖：
```json
"@react-awesome-query-builder/antd": "^6.6.0",
"@uiw/react-codemirror": "^4.23.0",
"@codemirror/lang-javascript": "^6.2.0",
"json-logic-js": "^2.0.0"
```

**`apps/gateway/package.json`** — 新增依赖：
```json
"json-logic-js": "^2.0.0"
```

### 第三部分：前端新建文件（3 个）

#### 3.1 `packages/studio/src/components/process/configs/jsonlogic-utils.ts`（新建）

JsonLogic 工具函数：

```ts
import jsonLogic from 'json-logic-js';

// 表达式文本 → JsonLogic（用 expr-eval 解析为 AST，再转 JsonLogic）
export function expressionToJsonLogic(expr: string): object | null;

// JsonLogic → 表达式文本（递归遍历 JsonLogic 树，生成可读表达式）
export function jsonLogicToExpression(rule: object): string;

// JsonLogic 求值（前端预览/校验用）
export function evaluateJsonLogic(rule: object, data: Record<string, unknown>): boolean;

// JsonLogic 语法校验
export function validateJsonLogic(rule: object): { valid: boolean; error?: string };
```

**表达式↔JsonLogic 转换规则**：
| 表达式 | JsonLogic |
|--------|-----------|
| `amount > 1000` | `{">": [{"var": "amount"}, 1000]}` |
| `status == "urgent"` | `{"==": [{"var": "status"}, "urgent"]}` |
| `a > 1 and b < 2` | `{"and": [{">": [{"var":"a"}, 1]}, {"<": [{"var":"b"}, 2]}]}` |
| `a > 1 or b < 2` | `{"or": [...]}` |
| `contains(field, "val")` | `{"in": ["val", {"var": "field"}]}` |

#### 3.2 `packages/studio/src/components/process/configs/ExpressionCodeEditor.tsx`（新建）

CodeMirror 表达式编辑器组件，带自动补全：

```tsx
interface ExpressionCodeEditorProps {
  value: string;           // 表达式文本
  onChange: (value: string) => void;
  variables: VariableOption[];  // 可用变量列表（来自 variable-resolver）
}
```

**自动补全内容**：
- **变量名**：来自 `variable-resolver.ts` 的 `resolveVariables()`，如 `decision`、`comment`、`amount`、`recordId`
- **运算符**：`and`、`or`、`>`、`<`、`>=`、`<=`、`==`、`!=`
- **函数**：`contains(field, "value")`、`notContains(field, "value")`
- **语法高亮**：变量名、字符串、数字、运算符不同颜色
- **实时校验**：底部显示 ✓ 语法正确 / ✗ 错误信息

#### 3.3 `packages/studio/src/components/process/configs/query-builder-config.ts`（新建）

react-awesome-query-builder 配置工厂：

```ts
import { AntdConfig, Utils as QbUtils } from '@react-awesome-query-builder/antd';

// 从 variable-resolver 的 VariableOption[] 构建 query-builder 的 fields 配置
export function buildQbFields(
  variables: VariableOption[],
): Record<string, BasicField>;

// 从 JsonLogic 加载到 query-builder 的 Immutable 树
export function loadFromJsonLogic(
  jsonLogic: object | null,
  config: Config,
): ImmutableTree;

// 从 query-builder 的 Immutable 树导出 JsonLogic
export function exportToJsonLogic(
  immutableTree: ImmutableTree,
  config: Config,
): object | null;
```

**字段类型映射**：
| VariableOption.type | query-builder type |
|---------------------|-------------------|
| `string` | `text` |
| `number` | `number` |
| `boolean` | `boolean` |
| `object` / `array` / `any` | `text`（降级） |

**运算符配置**：
- 文本：等于、不等于、包含(like)、不包含(not_like)、为空(is_empty)、不为空(is_not_empty)
- 数字：大于、小于、大于等于、小于等于、等于、不等于
- 布尔：等于

### 第四部分：前端重写文件（1 个）

#### 3.4 `packages/studio/src/components/process/configs/ConditionConfigForm.tsx`（重写）

**Props 不变**（保持与 `NodeConfigPanel` 的契约）：
```ts
interface ConditionConfigFormProps {
  data: ConditionConfigData;
  onChange: (data: ConditionConfigData) => void;
  disabled?: boolean;
  schema?: WorkflowSchema;
  currentNodeId?: string;
}
```

**`ConditionConfigData` 类型变更**：
```ts
interface ConditionBranchItem {
  label: string;
  condition?: object | null;  // 改为 JsonLogic JSON（之前是 string）
}
```

**组件结构**：
```
ConditionConfigForm
├── 分支列表
│   ├── 分支名 Input + 删除按钮
│   └── ConditionEditor（Tab 切换）
│       ├── Tab "可视化" → QueryBuilder（react-awesome-query-builder）
│       │   └── <Query> + <Builder>
│       │       fields = buildQbFields(variables)
│       │       value = loadFromJsonLogic(condition)
│       │       onChange → exportToJsonLogic → updateBranch
│       └── Tab "表达式" → ExpressionCodeEditor
│           └── <CodeMirror>
│               value = jsonLogicToExpression(condition)
│               onChange → expressionToJsonLogic → updateBranch
└── "添加分支" 按钮
```

**Tab 切换逻辑**：
- 切到可视化：`jsonLogicToExpression` → 不需要（直接从 JsonLogic 加载到 query-builder）
- 切到表达式：`exportToJsonLogic` → 不需要（直接从 JsonLogic 转为表达式文本）
- **两种模式共享同一个 JsonLogic 作为底层状态**，不再需要复杂的双向同步

**回退逻辑**：
- 表达式语法错误无法解析为 JsonLogic → Tab 标记提示，但允许留在表达式模式继续编辑
- JsonLogic 无法加载到 query-builder（如含自定义函数）→ 自动切到表达式模式

### 第五部分：前端修改文件（2 个）

#### 3.5 `packages/studio/src/components/process/configs/expression-utils.ts`（修改）

- 保留 `validateExpression`（表达式模式实时校验用）
- 删除 `visualToExpression` / `expressionToVisual`（被 jsonlogic-utils.ts 替代）
- 删除 `OPERATOR_OPTIONS` / `COMBINER_OPTIONS`（被 query-builder-config.ts 替代）
- 保留 `ConditionRow` / `VisualCondition` 类型（jsonlogic-utils 转换中间态用）

#### 3.6 `packages/studio/src/components/process/NodeConfigPanel.tsx`（微调）

`condition` case 不变 — Props 契约一致，只是 `ConditionConfigData.conditions[].condition` 的类型从 `string` 变为 `object | null`。

### 第六部分：后端修改（3 个文件）

#### 3.7 `packages/shared/src/process/index.ts`（类型变更）

```ts
export interface ConditionBranch {
  label: string;
  condition?: object | null;  // JsonLogic JSON（之前是 string）
}
```

#### 3.8 `apps/gateway/src/process/process-utils.ts`（修改）

**替换 `evaluateCondition`**：
```ts
import jsonLogic from 'json-logic-js';

export function evaluateCondition(
  rule: object | string | null | undefined,
  variables: Record<string, unknown>,
): boolean {
  if (!rule) return true;  // 空 = else/default
  // 兼容：如果 condition 是字符串（旧数据），用 expr-eval 求值
  if (typeof rule === 'string') {
    return evaluateExprEvalCondition(rule, variables);  // 保留旧逻辑做向后兼容
  }
  // JsonLogic 求值
  const scope = buildEvalScope(variables);
  return Boolean(jsonLogic.apply(rule, scope));
}
```

**保留 `buildEvalScope`** — 扁平化逻辑不变，json-logic-js 的 `{"var": "fieldName"}` 直接从扁平作用域取值。

#### 3.9 `apps/gateway/src/process/node-executors/condition.executor.ts`（微调）

`evaluateCondition` 调用不变（方法签名兼容）。`data.conditions` 读取不变（`ConditionBranch` 类型已更新）。

---

## 向后兼容策略

1. **旧数据**：已有流程的 `condition` 字段是 expr-eval 字符串。`evaluateCondition` 检测到 `typeof rule === 'string'` 时走旧逻辑（expr-eval 求值）。
2. **新数据**：新建/编辑的条件分支存储为 JsonLogic JSON。
3. **数据迁移**：编辑旧流程时，`ConditionConfigForm` 检测到 `condition` 是字符串 → 自动尝试用 `expressionToVisual` 解析 → 转 JsonLogic → 存为新格式。解析失败则保留旧格式。

---

## 测试计划

1. **单元测试**（jsonlogic-utils.ts）：
   - 表达式→JsonLogic 转换（单条件/AND/OR/contains）
   - JsonLogic→表达式 逆向转换
   - Round-trip 一致性
   - JsonLogic 求值正确性

2. **集成测试**（前端）：
   - 可视化模式：构建查询 → 切换到表达式 → 验证文本正确
   - 表达式模式：输入表达式 → 切换到可视化 → 验证树结构正确
   - 变量选择器：字段下拉显示上游节点输出
   - 自动补全：输入时显示变量名/运算符提示

3. **端到端测试**（后端）：
   - 保存 JsonLogic 格式条件 → 启动流程 → 条件分支正确求值
   - 旧格式数据（expr-eval 字符串）向后兼容

---

## 实施顺序

| 步骤 | 内容 | 预计文件数 |
|------|------|-----------|
| 1 | 知识库沉淀 | 2（新建 + README 更新）|
| 2 | 依赖安装 + jsonlogic-utils.ts | 3（2 个 package.json + 新建）|
| 3 | query-builder-config.ts + ExpressionCodeEditor.tsx | 2（新建）|
| 4 | ConditionConfigForm.tsx 重写 | 1（重写）|
| 5 | expression-utils.ts 精简 | 1（修改）|
| 6 | 后端 process-utils.ts + shared 类型 | 3（修改）|
| 7 | 构建验证 + 提交 | — |
| 8 | 浏览器测试 | — |
