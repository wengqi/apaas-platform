# 去掉流程自动保存，改为手动保存 + 退出提示

## 改动

### 1. ProcessEditor.tsx — 去掉防抖自动保存
- `handleSchemaChange` 中移除防抖保存逻辑（`saveTimerRef` + `saveMutation.mutate`）
- 仅保留 `store.setSchema(finalSchema)` 更新内存状态
- 手动保存按钮已有（`handleSave`），保持不变

### 2. ProcessEditor.tsx — 添加退出提示
- 添加 `useBeforeUnload` 或 `beforeunload` 事件监听
- 当 `store.dirty` 为 true 时，浏览器关闭/刷新前提示"您有未保存的更改"
- 添加路由级离开提示：通过 `useNavigate` 的 `beforeunload` 或 React Router 的 `useBlocker`（如果可用）
- 在工具栏显示"未保存"状态提示（已有 `dirty` 状态，检查是否已展示）

### 3. 工具栏 — 保存状态展示
- 检查 `ProcessEditorToolbar` 是否已显示"未保存"标记
- 如果没有，添加一个"未保存"提示在保存按钮旁

## 文件
- `packages/studio/src/pages/ProcessEditor.tsx`