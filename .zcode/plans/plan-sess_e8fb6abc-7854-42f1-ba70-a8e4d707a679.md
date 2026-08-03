# 应用删除功能实现

## 需求
在 Studio 构建端的应用列表页（AppList.tsx）添加删除应用的功能。

## 现状
- 后端 API `DELETE /api/apps/:appId` 已实现
- 前端 `appsApi.delete(id)` 已封装
- AppList.tsx 卡片无删除入口

## 实现方案
在应用卡片右上角添加「更多」按钮（MoreOutlined），点击弹出 Dropdown 菜单，包含「删除」选项。点击删除后弹出 Popconfirm 二次确认，确认后调用 `appsApi.delete`。

### 修改文件
- `packages/studio/src/pages/AppList.tsx`
  - 导入 `DeleteOutlined`、`MoreOutlined`、`Popconfirm`
  - 添加 `deleteMutation` 调用 `appsApi.delete`
  - 卡片右上角添加 Dropdown 菜单（停止事件冒泡避免触发卡片点击跳转）
  - 删除操作含 Popconfirm 二次确认 + 成功/失败提示