# flowgram.ai 仓库调研报告

> 调研日期：2026-07-31 | 调研方式：GitHub 源码 + 官方文档站 mdx 原文
> 调研目标：评估 fork flowgram.ai 作为"飞书式简化流程画布"的可行性

## 一、仓库概况

- **来源**：https://github.com/bytedance/flowgram.ai （字节跳动开源）
- **定位**：可扩展的工作流开发框架，飞书低代码工作流/多维表格/扣子背后的画布引擎
- **许可证**：**MIT（允许商用 fork，需保留版权声明）**
- **Monorepo 工具**：Rush 5.150.0 + pnpm 10.6.5（68 个包）
- **Node.js**：≥18.20.3 或 20.14.0~22.x

## 二、核心包清单

### 画布引擎 (canvas-engine)
| 包名 | 路径 | 职责 |
|---|---|---|
| @flowgram.ai/core | canvas-engine/core | 画布内核（基于自研 ECS 实体系统） |
| @flowgram.ai/document | canvas-engine/document | 流程文档模型（节点/边 CRUD） |
| @flowgram.ai/renderer | canvas-engine/renderer | 渲染层 |
| @flowgram.ai/free-layout-core | canvas-engine/free-layout-core | 自由布局核心（自由放置+连线+端口） |
| @flowgram.ai/fixed-layout-core | canvas-engine/fixed-layout-core | 固定布局核心（支持 branch/loop/TryCatch 复合节点） |

### 编辑器入口 (client)
| 包名 | 职责 |
|---|---|
| @flowgram.ai/free-layout-editor | Free Layout 对外入口（React Provider） |
| @flowgram.ai/fixed-layout-editor | Fixed Layout 对外入口（React Provider） |
| @flowgram.ai/editor | 编辑器基座 |

### 节点引擎 (node-engine)
| 包名 | 职责 |
|---|---|
| @flowgram.ai/node | 节点渲染组件（useNodeRender hook, Field 组件） |
| @flowgram.ai/form | 表单渲染/校验/联动 |
| @flowgram.ai/form-core | 表单内核 |

### 变量引擎 (variable-engine)
| 包名 | 职责 |
|---|---|
| @flowgram.ai/variable-core | **变量作用域链核心**（chainConfig.isNodeChildrenPrivate） |
| @flowgram.ai/variable-layout | 变量布局 |
| @flowgram.ai/json-schema | JSON Schema 处理（inputs/outputs） |

### 物料 (materials)
| 包名 | 职责 |
|---|---|
| @flowgram.ai/form-materials | 通用表单控件（createInjectMaterial） |
| @flowgram.ai/fixed-semi-materials | Semi UI 固定布局物料（LLM/Condition/Code/Loop 等） |
| @flowgram.ai/form-antd-materials | Ant Design 表单物料 |

### 运行时 (runtime) ⭐ 可替换
| 包名 | 职责 |
|---|---|
| @flowgram.ai/runtime-interface | **接口/数据模型层（仅类型，无运行时逻辑）** |
| @flowgram.ai/runtime-js | 核心运行库（引擎/执行器/状态/变量） |
| @flowgram.ai/runtime-nodejs | Node.js 服务（tRPC HTTP API） |

## 三、核心数据结构

```typescript
// WorkflowSchema — 节点图 JSON（编辑器产出 / 运行时输入）
interface WorkflowSchema {
  nodes: WorkflowNodeSchema[];
  edges: WorkflowEdgeSchema[];
  groups?: WorkflowGroupSchema[];
  globalVariable?: IJsonSchema;
}

// 节点
interface WorkflowNodeSchema<T = string, D = any> {
  id: string;
  type: T;          // 如 'start' | 'condition' | 'loop' | 自定义字符串
  meta: WorkflowNodeMetaSchema;  // { position, canvasPosition? }
  data: D & {
    title?: string;
    inputsValues?: Record<string, IFlowValue>;
    inputs?: IJsonSchema;
    outputs?: IJsonSchema;
  };
  blocks?: WorkflowNodeSchema[];  // 嵌套子节点（复合节点）
  edges?: WorkflowEdgeSchema[];   // 复合节点内部边
}

// 连线
interface WorkflowEdgeSchema {
  sourceNodeID: string;
  targetNodeID: string;
  sourcePortID?: string;
  targetPortID?: string;
}

// 节点输入值 — 四态类型（变量系统与节点数据的桥梁）
type IFlowValue =
  | { type: 'constant';    content?: string | number | boolean }
  | { type: 'ref';         content?: string[] }      // 引用其它变量
  | { type: 'expression';  content?: string }
  | { type: 'template';   content?: string };       // 模板字符串插值
```

## 四、运行时 API（可替换为自有后端）

官方推荐 fork 替换。输入输出契约：

```
调用: WorkflowRuntimeInvoke(schema: WorkflowSchema, inputs: WorkflowInputs) → Promise<WorkflowOutputs>
```

5 个 Task API（异步轮询模型）：

| API | HTTP | 入参 | 出参 |
|---|---|---|---|
| TaskRun | POST /api/task/run | { schema: string, inputs } | { taskID } |
| TaskReport | GET /api/task/report | { taskID } | { workflow: WorkflowStatus, nodes: NodeStatus[] } |
| TaskCancel | POST /api/task/cancel | { taskID } | { success } |
| TaskResult | GET /api/task/result | { taskID } | WorkflowOutputs |
| TaskValidate | POST /api/task/validate | { schema, inputs? } | { valid, errors[] } |

## 五、定制为"飞书式简化流程画布"

### 推荐：选 Fixed Layout
飞书审批流/多维表格是自上而下、节点拖入指定位置、支持分支/循环——正是 Fixed Layout。

### 替换内置节点为 aPaaS 业务节点（4 处改动）
1. **节点注册层**：新增/替换 `FlowNodeRegistry[]`（触发器/对象操作/条件/循环/通知），移除 LLM/Code
2. **节点物料**：基于 `createInjectMaterial` 自定义控件，或 fork `fixed-semi-materials`
3. **运行时执行器**：为自定义节点 type 注册执行逻辑
4. **图标/面板**：替换为业务图标

### 集成方式
- **推荐**：fork 整库，Rush 转 pnpm-workspace + turbo
- **最小依赖**：核心库作为 npm 依赖引入，物料源码用 CLI 拉出二开
- **runtime-interface**（仅类型）可直接复用

## 六、未确认项
- demo 包的 package.json 无 engines 字段（Node 约束统一在 rush.json）
- fork 转 pnpm-workspace + turbo 的可运行性需实施期自行验证
