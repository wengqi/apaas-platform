# 修复应用工作台资源统计始终为 0

## 问题
后端 `application.service.ts` 的 `get()` 方法（获取单个应用详情）不包含 `_count` 查询，返回的数据没有 `stats` 字段。前端 `AppDashboard` 通过 `app.stats` 取值，结果始终为 0。

## 修复
在 `get()` 方法中添加 `include: { _count: { select: { objects: true, pages: true, processes: true } } }`，并在返回值中添加 `stats` 字段。

**文件**: `apps/gateway/src/application/application.service.ts`（仅 get 方法）