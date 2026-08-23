# PRD — 数据管理（Phase 10.1 + 10.2）

> 飞书 aPaaS Module J 对齐 — 记录批量操作 + CSV 导入导出

## 1. 概述

### 1.1 目标

为记录模块增加批量操作和 CSV 导入导出能力，将数据管理飞书对齐度从 40% 提升至 65%。

### 1.2 飞书对齐

| 功能 | 飞书 | 本平台 | 对齐 |
|------|------|--------|------|
| 批量删除 | 列表勾选多条删除 | ✅ checkbox + batchDelete | 对齐 |
| 批量编辑 | 列表勾选多条批量修改 | ✅ checkbox + batchUpdate | 对齐 |
| CSV 导入 | apiName 列匹配 + 校验 + 错误报告 | ✅ csv-parse + 列头匹配 + 错误明细 | 对齐 |
| 导出 | 当前视图含筛选导出 | ✅ 含 filter 条件导出 | 对齐 |
| 导入模板 | 列头 + 示例 | ✅ getImportTemplate | 对齐 |
| Excel 格式 | 支持 | ❌ 仅 CSV | 简化 |
| 列映射 UI | 自动映射 + 手动调整 | ❌ 直接 apiName 匹配 | 简化 |
| 软删除 + 回收站 | 支持 | ❌ 硬删除 | 不在范围 |

## 2. 功能需求

### 2.1 批量操作（Task 10.2）

#### 2.1.1 批量创建
- API: `POST /objects/:objectId/records/batch-create`
- 入参: `{ records: Record<string, unknown>[] }`（最大 500 条）
- 逐条调用 create 逻辑（AutoNumber + Formula 计算）
- 单条失败不阻断其他记录，错误收集到 errors 数组
- 返回: `{ created: number, errors: ImportError[] }`

#### 2.1.2 批量更新
- API: `PUT /records/batch-update`
- 入参: `{ recordIds: string[], data: Record<string, unknown> }`（最大 500 条）
- 同一 data 覆盖到所有指定记录（含 Formula 重算）
- 返回: `{ updated: number, errors: ImportError[] }`

#### 2.1.3 批量删除
- API: `POST /records/batch-delete`
- 入参: `{ recordIds: string[] }`（最大 500 条）
- deleteMany 一次查询删除，触发删除事件
- 返回: `{ deleted: number }`

### 2.2 CSV 导入导出（Task 10.1）

#### 2.2.1 导出
- API: `GET /objects/:objectId/records/export?format=csv&filter=...&sort=...`
- 分页查询所有记录（pageSize=100 循环），csv-stringify 生成 CSV
- 排除只读字段（AutoNumber/Formula/Rollup）
- 应用 fieldScope 权限过滤列
- 返回: `Content-Type: text/csv` + `Content-Disposition: attachment`

#### 2.2.2 导入
- API: `POST /objects/:objectId/records/import`（multipart/form-data）
- multer FileInterceptor 接收 CSV 文件（最大 10MB）
- csv-parse 解析 → 第一行列头按 apiName 匹配 → 逐行构建 data → batchCreate
- 只读字段自动跳过
- 单行失败不阻断其他行
- 返回: `{ total, success, errors: ImportError[] }`
- 限制: 最大 5000 行

#### 2.2.3 导入模板
- API: `GET /objects/:objectId/records/import-template`
- 生成 CSV 模板（列头为可导入字段 apiName + 1 行示例）
- 排除只读字段

### 2.3 前端 UI

#### 2.3.1 表格行选择
- AntD Table rowSelection（checkbox 多选）
- 选中时显示浮出操作条（飞书交互模式）

#### 2.3.2 批量操作浮动条
- 显示选中数量
- 批量删除（Popconfirm 确认）
- 取消选择按钮

#### 2.3.3 工具栏按钮
- 导入按钮 → 打开 ImportRecordsModal
- 导出按钮 → 调用 exportCsv 下载 CSV（含当前筛选条件）

#### 2.3.4 导入弹窗（ImportRecordsModal）
- 下载模板按钮
- Upload 拖拽上传 CSV 文件
- 确认导入 → 显示结果（成功数 / 失败数 / 错误明细表格）

## 3. 数据模型

### 3.1 共享类型（packages/shared/src/record/index.ts）

```typescript
ImportError { row: number; field?: string; message: string }
BatchCreateResult { created: number; errors: ImportError[] }
BatchUpdateResult { updated: number; errors: ImportError[] }
BatchDeleteResult { deleted: number }
ImportResult { total: number; success: number; errors: ImportError[] }
```

### 3.2 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| BATCH_MAX_ROWS | 500 | 批量操作最大行数 |
| IMPORT_MAX_ROWS | 5000 | CSV 导入最大行数 |
| IMPORT_FILE_MAX_SIZE_MB | 10 | 导入文件最大体积 |

## 4. 验收标准

1. ✅ 表格支持 checkbox 多选，选中后显示浮动操作条
2. ✅ 批量删除选中记录，Popconfirm 确认后执行
3. ✅ 导出当前视图（含筛选条件）为 CSV 文件
4. ✅ 上传 CSV 文件导入记录，显示成功/失败统计
5. ✅ 下载导入模板 CSV
6. ✅ 导入时只读字段自动跳过
7. ✅ 导出时只读字段排除
8. ✅ 后端 10 单元测试全部通过

> **验收状态**: ✅ typecheck + test + lint + build + doc-sync 全部通过
