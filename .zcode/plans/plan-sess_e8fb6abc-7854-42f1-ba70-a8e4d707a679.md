# 应用归档与删除功能

## 后端
1. ApplicationService 新增 `archive()` 方法（状态→ARCHIVED，在途流程不受影响）
2. ApplicationService 修改 `delete()`：PUBLISHED 阻止删除（需先归档）；ARCHIVED 检查在途实例
3. ApplicationController 新增 `POST /apps/:appId/archive` 端点

## 前端 Studio
4. AppList 卡片菜单按状态显示不同操作：DRAFT→删除 / PUBLISHED→归档 / ARCHIVED→删除

## 前端 Runtime-UI
5. 首页过滤掉 ARCHIVED 状态应用