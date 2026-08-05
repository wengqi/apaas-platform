# 条件表达式重构方案 — 2026-08-05

> 本文档记录条件表达式编辑器从自研混合模式重构为 react-awesome-query-builder + JsonLogic + CodeMirror 的架构决策和实施过程。

---

## 一、现有条件表达式体系的问题

### 1.1 扁平化限制
- 当前可视化模式仅支持扁平 AND/OR 组合（全局单一组合符），无法表达"A 且 B 或 C"等嵌套逻辑
- 含括号或混合 AND/OR 的表达式无法可视化，靠 Tab 回退到表达式模式掩盖
- `expressionToVisual` 用正则占位符技巧（`__contains__`）做反向解析，脆弱且依赖正则顺序

### 1.2 contains/notContains 功能缺陷
- 前端 `visualToExpression` 生成 `contains(field, "value")` 函数调用
- 后端 `process-utils.ts` 的 expr-eval `Parser` **未注册 contains/notContains 自定义函数**
- 导致运行时求值必然失败（抛异常 → 返回 false → 条件分支永远不进入）

### 1.3 两套变量体系割裂
- `VariablePicker.tsx`（TreeSelect，点分路径 `trigger.record.id`，用于 IFlowValue.ref）
- 条件编辑器（扁平字段名 `recordId`、`decision`，用于 expr-eval `buildEvalScope`）
- 两套体系完全独立，字段名不兼容（expr-eval 不支持 `\w+` 以外的变量名）

### 1.4 表达式模式体验差
- 纯 `Input.TextArea`，无语法高亮、无自动补全、无变量提示
- 用户需要记住变量名和运算符语法

---

## 二、react-awesome-query-builder 适配性评估

### 2.1 技术栈匹配度：高

| 维度 | aPaaS | RAQB 要求 | 结论 |
|------|-------|----------|------|
| React | 18.3.1 | ^16.8.4 \|\| ^17 \|\| ^18 \|\| ^19 | ✅ |
| Ant Design | 5.29.3 | ^4.17 \|\| ^5 | ✅ |
| TypeScript | 5.6.3 | 自带类型 | ✅ |
| 构建器 | Vite 6 | 无特殊要求 | ✅ |
| 日期库 | dayjs | 不依赖 moment | ✅ |

### 2.2 核心能力

| 能力 | 支持情况 |
|------|---------|
| 嵌套 AND/OR 分组 | ✅ 树形结构，无限嵌套 |
| Ant Design 主题 | ✅ `@react-awesome-query-builder/antd` |
| 字段类型 | text/number/boolean/date/select/multiselect/自定义 |
| 运算符 | 15+ 种：==/!=/>/</>=/<=/like/not_like/starts_with/ends_with/is_empty/is_not_empty/is_null/is_not_null/between |
| 拖拽排序 | ✅ `@react-querybuilder/dnd` |
| JsonLogic 导出/导入 | ✅ 原生 `Utils.jsonLogicFormat` / `Utils.loadFromJsonLogic` |
| SQL/MongoDB/SpEL 导出 | ✅ |
| TypeScript | ✅ 完整类型定义 |
| i18n | ✅ i18next |

### 2.3 主要摩擦点

1. **Immutable.js 运行时**：RAQB 内部用 Immutable.js 存储查询树，需 `Utils.loadTree` / `Utils.getTree` 在边界转换
2. **无自由表达式输入模式**：RAQB 仅提供可视化树编辑器，表达式 Tab 需自行封装
3. **无文本 contains 运算符**：内置 `like`（通配符匹配）可覆盖 contains 语义，或自定义运算符

### 2.4 版本和包结构

从 v6 起拆分为按 UI 框架分发的多个包：
- `@react-awesome-query-builder/core` — 纯逻辑核（可用于 Node/SSR）
- `@react-awesome-query-builder/antd` — Ant Design 主题包（aPaaS 使用此包）

GitHub: 2.3k stars, 909 commits, 活跃维护。

---

## 三、JsonLogic 格式选型理由

### 3.1 为什么选 JsonLogic

| 维度 | expr-eval 字符串 | JsonLogic JSON |
|------|-----------------|----------------|
| 格式 | 字符串 `"a > 1 and b < 2"` | JSON `{"and":[{">":[{"var":"a"},1]},{"<":[{"var":"b"},2]}]}` |
| 可序列化 | ✅ | ✅（原生 JSON） |
| 跨语言 | ❌ JS 专属 | ✅ JS/Python/Java/PHP/Ruby/Go |
| 安全性 | ⚠️ `parser.parse()` 需信任输入 | ✅ 无 eval、无副作用、确定性 |
| 标准化 | ❌ expr-eval 自有语法 | ✅ jsonlogic.com 规范 |
| RAQB 原生支持 | ❌ 需自写转换 | ✅ `jsonLogicFormat` / `loadFromJsonLogic` |
| 嵌套逻辑 | ⚠️ 括号（expr-eval 支持但可视化困难） | ✅ 树形结构天然支持 |

### 3.2 JsonLogic 表达式示例

```json
// amount > 1000 AND status == "urgent"
{
  "and": [
    {">": [{"var": "amount"}, 1000]},
    {"==": [{"var": "status"}, "urgent"]}
  ]
}

// contains(field, "value") — JsonLogic 用 "in" 操作符
{"in": ["value", {"var": "field"}]}

// 嵌套：(a > 1 OR b < 2) AND c == 3
{
  "and": [
    {"or": [
      {">": [{"var": "a"}, 1]},
      {"<": [{"var": "b"}, 2]}
    ]},
    {"==": [{"var": "c"}, 3]}
  ]
}
```

### 3.3 后端求值

```ts
import jsonLogic from 'json-logic-js';

const rule = {">": [{"var": "amount"}, 1000]};
const data = { amount: 5000 };
jsonLogic.apply(rule, data);  // → true
```

`json-logic-js` 的 `{"var": "fieldName"}` 直接从传入的 data 对象取值，与现有 `buildEvalScope` 的扁平化作用域兼容。

---

## 四、CodeMirror 6 自动补全方案

### 4.1 选型

使用 `@uiw/react-codemirror`（CodeMirror 6 的 React 封装）：
- 支持 React 16.8+（与 aPaaS React 18 兼容）
- 内置 autocompletion（通过 `basicSetup` 默认开启）
- 支持自定义 completion source（通过 `@codemirror/autocomplete`）
- TypeScript 支持
- 轻量（CodeMirror 6 模块化架构）

### 4.2 自动补全内容

| 补全类型 | 来源 | 示例 |
|---------|------|------|
| 变量名 | `variable-resolver.ts` 的 `resolveVariables()` | `decision`、`comment`、`amount`、`recordId` |
| 运算符 | 静态定义 | `and`、`or`、`>`、`<`、`>=`、`<=`、`==`、`!=` |
| 函数 | 静态定义 | `contains(field, "value")`、`notContains(field, "value")` |

### 4.3 语法高亮

使用 `@codemirror/lang-javascript` 提供：
- 变量名：默认颜色
- 字符串：引号内绿色
- 数字：橙色
- 运算符：紫色
- 函数名：蓝色

---

## 五、架构设计

### 5.1 数据流

```
可视化模式:
  react-awesome-query-builder 树 → Utils.jsonLogicFormat() → JsonLogic JSON → 存储

表达式模式:
  CodeMirror 编辑文本 → expressionToJsonLogic() → JsonLogic JSON → 存储
  CodeMirror 加载 ← jsonLogicToExpression() ← JsonLogic JSON ← 读取

后端求值:
  JsonLogic JSON → jsonLogic.apply(rule, buildEvalScope(variables)) → boolean
```

### 5.2 文件结构

```
packages/studio/src/components/process/configs/
├── ConditionConfigForm.tsx       (重写 — RAQB + CodeMirror 双模式)
├── jsonlogic-utils.ts            (新建 — 表达式↔JsonLogic 转换)
├── query-builder-config.ts       (新建 — RAQB 配置工厂)
├── ExpressionCodeEditor.tsx      (新建 — CodeMirror 编辑器 + 补全)
├── expression-utils.ts           (精简 — 保留 validateExpression)
├── variable-resolver.ts          (不变 — 变量解析)
└── ...

apps/gateway/src/process/
├── process-utils.ts              (修改 — JsonLogic 求值 + 向后兼容)
└── node-executors/condition.executor.ts (微调 — 类型适配)

packages/shared/src/process/
└── index.ts                      (修改 — ConditionBranch.condition 类型变更)
```

### 5.3 向后兼容策略

1. **旧数据**（expr-eval 字符串）：`evaluateCondition` 检测 `typeof rule === 'string'` → 走旧 expr-eval 求值
2. **新数据**（JsonLogic JSON）：`evaluateCondition` 检测 `typeof rule === 'object'` → 走 json-logic-js 求值
3. **编辑旧流程**：`ConditionConfigForm` 检测 `condition` 是字符串 → 自动转换为 JsonLogic → 存为新格式

---

## 六、表达式↔JsonLogic 转换规则

| 表达式 | JsonLogic |
|--------|-----------|
| `amount > 1000` | `{">": [{"var": "amount"}, 1000]}` |
| `status == "urgent"` | `{"==": [{"var": "status"}, "urgent"]}` |
| `a > 1 and b < 2` | `{"and": [{">": [{"var":"a"}, 1]}, {"<": [{"var":"b"}, 2]}]}` |
| `a > 1 or b < 2` | `{"or": [...]}` |
| `contains(field, "val")` | `{"in": ["val", {"var": "field"}]}` |
| `notContains(field, "val")` | `{"!": {"in": ["val", {"var": "field"}]}}` |

---

## 七、依赖清单

### studio 新增
```json
"@react-awesome-query-builder/antd": "^6.6.0",
"@uiw/react-codemirror": "^4.23.0",
"@codemirror/lang-javascript": "^6.2.0",
"json-logic-js": "^2.0.0"
```

### gateway 新增
```json
"json-logic-js": "^2.0.0"
```

### 保留
- `expr-eval: ^2.0.2` — 向后兼容旧数据求值 + 表达式模式语法校验
