# 运行时流程轨迹视图 + 驳回功能

## 一、运行时流程轨迹视图

### 后端 API
**新增**: `GET /api/processes/:id/instances/:instanceId/trace`
- 返回 WorkflowSchema + 节点执行状态合并数据
- 从 `ProcessDef.workflowSchema` + `ProcessInstance` + `NodeExecution` 组装
- 节点状态映射：COMPLETED/RUNNING/WAITING/SKIPPED/PENDING

### 前端 — 构建态
**新增组件**: `ProcessTraceViewer.tsx`
- 复用 `FixedLayoutEditorProvider`（readonly: true）
- 扩展 `ApaasNodeRenderer`，传入节点状态映射
- 节点状态着色：绿色✅(完成) / 蓝色🔵(执行中) / 橙色⏳(等待) / 灰色半透明(跳过/未到达)
- 连线着色：已走路径高亮 / 未走路径半透明

**文件**: `packages/studio/src/components/process/ProcessTraceViewer.tsx`（新建）
**文件**: `packages/studio/src/components/process/SimplifiedEditor.tsx`（扩展渲染器支持状态着色）

### 前端 — 运行时
**扩展**: `packages/runtime-ui/src/pages/TaskCenter.tsx`
- 任务详情弹窗中新增"流程轨迹"Tab
- 调用 trace API 获取数据
- 用简化的只读流程图（SVG 或简化版组件）展示轨迹

### 前端 — 构建态流程监控
**扩展**: `packages/studio/src/components/process/ProcessMonitor.tsx`
- 流程实例列表点击查看轨迹
- 复用 `ProcessTraceViewer` 组件

## 二、驳回功能

### 后端 — 人工任务节点配置
**修改**: `apps/gateway/src/process/node-executors/user-task/`
- 人工任务节点配置新增 `rejectToNodeId` 字段（可选，指定驳回目标节点）
- `completeTask` 时若 decision='rejected'，引擎将 token 跳回 `rejectToNodeId`

### 后端 — 引擎跳转
**修改**: `apps/gateway/src/process/process-engine.ts`
- `completeTask` 新增驳回逻辑：
  - decision='rejected' 且有 rejectToNodeId → 清除当前 token，在 rejectToNodeId 创建新 token
  - 记录驳回审计日志

### 前端 — 节点配置
**修改**: `packages/studio/src/components/process/configs/UserTaskConfigForm.tsx`
- 新增"驳回目标"下拉选择（可选择流程中的其他节点）
- 新增"允许驳回"开关

### 前端 — 运行时
**修改**: `packages/runtime-ui/src/pages/TaskCenter.tsx`
- 任务详情中，若该任务允许驳回，显示"驳回"按钮
- 点击后弹出确认框，选择驳回目标节点

## 文件清单

**新增** (2 个):
- `packages/studio/src/components/process/ProcessTraceViewer.tsx`
- `apps/gateway/src/process/trace.service.ts`（或直接在 process.service 中添加方法）

**修改** (8 个):
- `apps/gateway/src/process/process.controller.ts` — 新增 trace API
- `apps/gateway/src/process/process.service.ts` — getTrace 方法
- `apps/gateway/src/process/process-engine.ts` — 驳回跳转逻辑
- `packages/studio/src/components/process/SimplifiedEditor.tsx` — 节点状态着色
- `packages/studio/src/components/process/ProcessMonitor.tsx` — 集成轨迹视图
- `packages/studio/src/components/process/configs/UserTaskConfigForm.tsx` — 驳回配置
- `packages/runtime-ui/src/pages/TaskCenter.tsx` — 轨迹展示 + 驳回按钮
- `packages/studio/src/api/processes.ts` — trace API 封装