# ADR-0001: 采用架构决策记录（ADR）机制

- 状态：已接受
- 日期：2026-09-26

## 背景

此前架构决策散落在 AGENTS.md「关键架构决策」与 `docs/knowledge-base/` 的审计/分析文档中，缺少统一的决策日志：决策的上下文（为什么、否决了哪些备选、有什么后果）没有固定载体，跨会话容易被遗忘或被重新讨论。

## 决策

1. 采用轻量 ADR：每个重大架构决策一个文件，命名 `NNNN-kebab-case-title.md`，包含状态/日期/背景/决策/后果五节。
2. 新增或推翻重大决策必须新建 ADR；被取代的 ADR 把状态改为「被 ADR-XXXX 取代」，不删除。
3. AGENTS.md「关键架构决策」保留为摘要索引，详情以 ADR 为准。

## 既有决策登记

以下决策在 ADR 机制引入前已生效，背景与后果详见 `docs/knowledge-base/` 相关文档：

| # | 决策 | 摘要 |
|---|------|------|
| 1 | 单体优先 | 三个微服务骨架保留但暂不拆分（TD-16），所有业务在 gateway |
| 2 | JSONB 宽表 | 记录存储用通用 records 表 + data JSONB，非每对象建表 |
| 3 | WorkflowSchema SSOT | 流程引擎直接消费 JSON Schema，单模式编辑器零翻译 |
| 4 | 类型契约先行 | packages/shared 定义所有跨层 DTO，前后端共享 |
| 5 | 行级权限条件翻译器 | PermissionService 算 condition → condition-translator → Prisma where |

## 后果

- 决策可追溯、可引用（PR / commit 中引用 ADR 编号即可），AI 跨会话不再重新发明已经否决过的方案。
- 代价：重大变更需要多写一份短文档，接受该成本。
