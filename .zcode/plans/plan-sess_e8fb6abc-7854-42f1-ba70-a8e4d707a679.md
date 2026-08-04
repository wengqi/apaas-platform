# 修复任务表单下拉选择不到页面

## 问题
ProcessEditor 只加载了 objects 列表，没有加载 pages 列表。`formOptions` prop 从未传入 SimplifiedEditor，导致任务表单下拉为空。

## 修复
在 `ProcessEditor.tsx` 中：
1. 导入 `pagesApi`
2. 加载应用页面列表（useQuery）
3. 将页面列表转为 `formOptions`（label=页面名, value=页面ID）
4. 传入 `SimplifiedEditor` 的 `formOptions` prop

**文件**: `packages/studio/src/pages/ProcessEditor.tsx`