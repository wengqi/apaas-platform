# 资源依赖链批量提交（AI 单波生成完整应用）——2026-10-03

> AI-first 打磨轮 backlog 第一优先项落地。此前 AI 从零生成完整应用要 **4+ 次 submit + 4 次人审 + 3 轮轮询**（页面等对象批准拿 ID、流程等页面批准拿 pageId——依赖链强制分波）；现在 **1 次 `submit_app_drafts` + 审核中心一次"一键批准"**，落地时自动按依赖顺序接线。

## 一、机制设计

### 引用令牌（跨资源依赖在批准前的占位协议）

| 场景 | Agent 写法 | 落地时解析 |
|---|---|---|
| 页面关联本批对象 | `pages[].objectApiName: "meeting_booking"` | 提交时：活表对象→真实 objectId；本批对象→快照存 `@ref:object:<apiName>` 令牌 |
| 流程绑定本批审批页 | `workflowSchema` 中 `user_task.pageId: "@ref:page:meeting_approval"` | 批准时：令牌→活表页面真实 ID（深度遍历 JSON 替换） |

令牌协议 `@ref:(object|page):<apiName>`（正则 `^@ref:(object|page):([a-z][a-z0-9_]*)$`），收集/替换为纯函数（`collectRefTokens` / `replaceRefTokens`，单测覆盖）。

### 拓扑序落地

批量批准按 **对象→页面→流程** 顺序 applySnapshot；页面落地前解析 objectId 令牌，流程落地前重写 schema 内全部 @ref:page 令牌。中途失败报错含失败项与已落地数（部分成功语义，显式告知）。

### 治理不变量保持（ADR-0003：全环境人审）

- AI 仍只产草稿：批次全部 PENDING，批准前不触碰活表
- 一次人审 = 审核中心批次条上一次"一键批准"（人看 diff 的粒度不变，DiffDrawer 逐单可查）
- 批量驳回级联整批（防半批落地的悬挂引用），意见回传 agent
- 漂移保护沿用（applyApproved 复用单批逻辑）；批量审计（REVIEW_SUBMIT/APPROVE resource=APPLICATION + batchId）

## 二、改动清单

| 层 | 文件 | 内容 |
|---|---|---|
| db | Prisma `ResourceVersion.batchId`（+`@@index([appId, batchId])`，迁移 20261003153313_review_batch_id） | 批次锚点 |
| shared | `ResourceVersionDto.batchId` | 前后端契约 |
| gateway/review | `submitAiBatch` / `approveBatch`（拓扑序+令牌解析，抽 `applyApproved` 复用）/ `rejectBatch`；`collectRefTokens`/`replaceRefTokens` 导出 | 批量治理核心 |
| gateway/controller | `POST :appId/reviews/batch/:batchId/approve|reject`（注意声明在 `:submissionId` 路由前，防路径参数吞掉 `batch`） | HTTP 面 |
| gateway/mcp | 工具 `submit_app_drafts`（objects[]/pages[]/processes[] 单波；G3 逐项校验；objectApiName/令牌目标解析——活表∪本批，无效即整批拒）；`list_review_submissions` 附 batchId | AI 面 |
| studio | 审核中心 `BatchBar`（批次分组 + 一键批准/批量驳回）+ 列表"批次"标记；`reviewsApi.approveBatch/rejectBatch` | 人审 UX |

单测：review.service.spec +8（令牌纯函数/共享 batchId/拓扑序断言（applySnapshot 调用序 OBJECT→PAGE→PROCESS）/objectId 令牌解析/pageId 令牌重写/空批次拒绝/令牌目标缺失报错/级联驳回）。gateway 707 全绿。

## 三、实测（真实 MCP 协议，2026-10-03）

1. `create_application` → 应用「会议预定」
2. **一次 `submit_app_drafts`**：对象 meeting_booking（4 业务字段）+ 页面×2（booking_form 引用 objectApiName；meeting_approval 审批页）+ 流程 meeting_approval_flow（RECORD_CREATED，user_task.pageId=`@ref:page:meeting_approval`）→ 首次被 G3 拦（select options 缺 value——agent 自修正闭环演示）→ 修正后 4 项进审（batchId 共享）
3. 审核中心：批次条「4 项资源：会议审批、会议审批页、会议提交、会议预定单」→ **一键批准** → 待审清零
4. 落地验证：对象 9 字段；booking_form.objectId=对象真实 ID（令牌已解析）；流程 DRAFT 且 user_task.pageId=审批页真实 ID（令牌已重写）
5. `list_review_submissions`：4 项 APPROVED + batchId 回传（agent 轮询闭环）

**效果对比：4+1 次 MCP 写调用 + 4 次人审 + 3 轮轮询 → 2 次调用 + 1 次人审 + 1 轮轮询。**

## 四、遗留与后续

- 流程激活仍需人工在搭建器"发布流程"（治理语义保留：批准=落 DRAFT，上线=人工发布）
- 页面 schema 里的 api.url 引用对象路径（如 records API 的 objectId 段）仍是 agent 自拼——后续可考虑表单模板 api.url 也支持令牌
- MCP 无 users/roles 列表工具，审批人 ID 靠既有知识（本测试直接用 builder ID）——`list_permission_roles`/`list_users` 只读工具待补
- 单资源 submit_*_draft 保持不变（小改动单资源仍走轻量路径）


---

# 追加（2026-10-04）：会议预定应用实测——三个连带缺陷修复

> ①b 收尾验证「会议预定」AI 生成应用（发布 0.1.0→0.1.2）时，真实使用暴露三个缺陷并当场修复：

| # | 缺陷 | 修复 |
|---|---|---|
| #18 | AI 无法预知自建对象 ID——页面 api.url 只能写占位符，提交 404 | 快照落地时解析 schema 内 `@ref:object:` 令牌（含 URL 子串形态 `/objects/@ref:object:x/records`）为真实对象 ID（spec 覆盖） |
| #20 | 运行时 fetcher 失败分支静默（HTTP 异常不弹 toast，与成功提示不对称） | catch 分支对写操作弹 `message.error(操作失败：原因)` |
| #21 | **方言指南错误**：教 AI 写 `/api/v1/...` 前缀，而 axios baseURL='/api' 拼成 `/api/api/v1/...`；正确契约=相对资源路径 `/objects/.../records`（采购合同种子页即此写法） | fetcher 剥离 `/api(v1)` 重复前缀（两种写法兼容）+ 方言指南纠正 + 校验器报错文案更新 |

附 `list_users`/`list_roles` 只读 MCP 工具（AI 自主配审批人：assignee/approveUsers 拿用户 ID、candidateGroups 拿角色 ID；16 工具）。

**全链路终验（0.1.2）**：运行时提交「季度复盘会/大会议室/8人/待审批」→ 流程自动触发 → admin 任务中心 → **AI 生成的静态审批页绑定渲染**（会议主题/会议室/参会人数 + 审批意见输入框，非裸 JSON）→ 批准 → 实例 COMPLETED。AI 单波生成的应用（含审批页绑定）至此与人工搭建的应用能力完全对齐。

**发布向导版本号输入坑**：type 前未清空默认值导致字符串拼接（`0.1.00.1.2`）——自动化需先清空；真人影响小（会手动清）。

---

# 追加（2026-10-04 下午）：审批回调 webhook（agent 闭环替代轮询）

## 机制

- 环境变量 `REVIEW_CALLBACK_URL`（可选）+ `REVIEW_CALLBACK_SECRET`（可选，≥16 字符）配置后，批/驳（单资源与批量共四点）POST 事件到该 URL
- 载荷：`{ event: review.approved|review.rejected, tenantId, appId, batchId, submissionId, module, apiName, status, reviewComment, reviewedBy, timestamp }`
- 签名：`X-Apaas-Signature`（HMAC-SHA256 hex of body）+ `X-Apaas-Event` 头；出站经 safeFetch（SSRF 防护——本地回环默认被拦，开发联调需 `OUTBOUND_ALLOW_PRIVATE=true`）
- 失败不阻塞审批主流程（审批已落库，接收方按 event+submissionId/batchId 幂等）
- 未配置 URL = 通道关闭，零开销

## 实测

本地 mock 接收器（:9722）+ 网关带 env 重启：MCP 提交 → 批量驳回 API → 接收器收到 `review.rejected`，**sig_ok=true**（HMAC 验签通过），载荷完整。期间一个插曲：连续 400「批次不存在」实为测试脚本 app id 复制错误（采购合同 ≠ 会议预定）——反向验证了应用级隔离正确生效。

## 接入点

review.service：approve / reject / approveBatch / rejectBatch 四处，经 `emitCallback` 统一组装（ReviewCallbackService 注入，mock 友好；spec +1 覆盖四点断言）。

## Agent 侧接入指引

ZCode 等客户端起一个 HTTP 服务暴露 hook URL，配置 REVIEW_CALLBACK_URL 后即可被动接收审批结果；无回调条件时保留 list_review_submissions 轮询兜底。
