# DESIGN — 数据管理（Phase 10.1 + 10.2）

> 飞书 aPaaS Module J 对齐 — 记录批量操作 + CSV 导入导出技术设计

## 1. 架构概览

```
前端 (Studio)
  RecordList.tsx
    ├── rowSelection (checkbox 多选)
    ├── 批量操作浮动条 (批量删除)
    ├── 工具栏: 导入按钮 + 导出按钮
    └── ImportRecordsModal.tsx (上传 → 结果)
         ↓
API 客户端 (objects.ts records)
  batchCreate / batchUpdate / batchDelete
  exportCsv / importCsv / getImportTemplate
         ↓
后端 (Gateway)
  RecordController
    ├── batch-create / batch-update / batch-delete
    ├── export (GET, CSV 响应)
    ├── import (POST, multer FileInterceptor)
    └── import-template (GET, CSV 响应)
         ↓
  RecordService (批量操作 — 复用单条 create/update/delete 逻辑)
  RecordImportExportService (CSV 解析/生成 — csv-parse + csv-stringify)
```

## 2. 后端设计

### 2.1 批量操作（RecordService）

**设计决策：逐条处理而非批量 SQL**

batchCreate 循环调用 `this.create()` 而非 `prisma.record.createMany()`，因为：
- create 逻辑含 AutoNumber 生成（异步、需查全表计数）和 Formula 计算（同步）
- createMany 不触发 Prisma 中间件、不支持逐条字段计算
- 错误隔离：单条失败不阻断其他记录，错误收集到 errors 数组

batchDelete 使用 `deleteMany` 一次查询删除（无需逐条计算），触发删除事件按 objectId 分组。

### 2.2 CSV 导入导出（RecordImportExportService）

**依赖：** `csv-parse`（解析）+ `csv-stringify/sync`（生成）— 轻量纯 JS，无原生依赖。

**导出流程：**
1. 查询 ObjectMeta 获取字段定义
2. 过滤只读字段（AutoNumber/Formula/Rollup）
3. 应用 fieldScope 权限过滤列
4. 分页查询所有记录（pageSize=100 循环，复用 RecordService.query 含权限注入）
5. csv-stringify 生成 CSV 字符串

**导入流程：**
1. 查询 ObjectMeta 获取字段定义
2. csv-parse 解析（columns: true 自动第一行为列头）
3. 列头按 apiName 匹配，未知字段记录错误
4. 逐行构建 data 对象（跳过只读字段和未知字段）
5. 调用 batchCreate（复用 AutoNumber/Formula 计算）
6. 合并列头错误 + 行创建错误

**模板生成：**
- 列头为可导入字段 apiName（排除只读字段）
- 示例行按字段类型生成（Number→100, Date→2026-01-01, Text→示例文本等）

### 2.3 文件上传

使用 `@nestjs/platform-express` 内置的 multer：
- `@UseInterceptors(FileInterceptor('file'))` + `@UploadedFile()`
- 文件通过 `file.buffer.toString('utf-8')` 读取为 CSV 文本
- 文件大小限制由 multer 的 `limits.fileSize` 控制（IMPORT_FILE_MAX_SIZE_MB）

### 2.4 响应格式

- 批量操作: `{ ok: true, data: { created/updated/deleted, errors } }`
- 导出: 直接返回 CSV（`Content-Type: text/csv` + `Content-Disposition: attachment`）
- 导入: `{ ok: true, data: { total, success, errors } }`
- 模板: 直接返回 CSV

## 3. 前端设计

### 3.1 RecordList.tsx 改动

**新增状态：**
- `selectedRowKeys: React.Key[]` — 选中行 ID
- `importOpen: boolean` — 导入弹窗开关

**新增 mutations：**
- `batchDeleteMutation` — 批量删除 + 清空选择 + 刷新列表
- `exportMutation` — 导出 CSV + Blob 下载

**UI 改动：**
- Table 添加 `rowSelection` prop
- 选中行时显示蓝色浮出操作条（已选择 N 项 + 批量删除 + 取消选择）
- 工具栏新增导入/导出按钮

### 3.2 ImportRecordsModal.tsx（新建）

三阶段交互：
1. **上传阶段** — 下载模板按钮 + Dragger 拖拽上传 CSV
2. **确认阶段** — 确认导入按钮
3. **结果阶段** — Alert 显示统计 + Table 展示错误明细（行号/字段/错误）

## 4. 简化项说明

| 功能 | 飞书 | 本平台 | 理由 |
|------|------|--------|------|
| Excel 格式 | CSV/Excel | 仅 CSV | CSV 最通用，避免引入重依赖 |
| 列映射 UI | 自动+手动 | 直接 apiName 匹配 | 简化交互，后续可加映射步骤 |
| 异步导入 | 大文件异步队列 | 同步处理(≤5000行) | 避免引入 ImportJob 模型复杂度 |
| 字段校验 | 必填/类型/唯一 | 不校验 | 与现有 create 一致 |
| 软删除 | 硬删除+回收站 | 硬删除 | 不在本次范围 |

> **验收状态**: ✅ 10 单元测试 + typecheck + lint + build 全部通过
