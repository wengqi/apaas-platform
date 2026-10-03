# AI 第一公民主线打磨——第一轮(2026-10-03)

> 方法论:不做"逐项打磨整个产品",做**主线纵深打磨**——以 AI Agent 第一公民身份用 MCP 从零生成完整应用,走完全生命周期,记录每个摩擦点,按阻塞度排序修。模块进入"极致打磨"的门槛:**主线用到 + 真实走通过至少一轮**。
> 本轮验证主链:MCP 建应用 → 对象/页面/流程草稿 → 人审批准 → 发布 → 运行时触发 → 人工审批 → 状态回写 → 站内通知。

## 一、主线全链路验证(八步全通)

以 builder 身份(builder@apaas.dev)经 MCP Streamable HTTP 端点(`/api/v1/mcp`,ZCode 客户端同款接入):

| # | 步骤 | 结果 |
|---|---|---|
| 1 | `create_application` 建应用(本轮新增工具) | mcp_polish_leave,DRAFT |
| 2 | `validate_schema` + `submit_object_draft` 请假单(6 业务字段) | PENDING → 人审 APPROVED → 系统字段自动注入 |
| 3 | `submit_page_draft` ×2(表单页+审批页,照猫画虎 get_page 参考页) | PENDING → APPROVED → pageId 落地 |
| 4 | `submit_workflow_draft` 请假审批流(RECORD_CREATED 触发/single 审批/条件分支/状态回写/双通知) | PENDING → APPROVED → DRAFT 落地 |
| 5 | 流程激活(publish)+ 应用发布(1.0.0) | 快照+环境指针 |
| 6 | 创建请假记录(POST /objects/:id/records) | 实例自动创建,WAITING_USER_TASK |
| 7 | 审批任务 complete(APPROVED) | 实例 COMPLETED |
| 8 | 验证 | 记录 status approving→**approved**(object_operation 回写);**IN_APP 通知触达**;审核系统通知也在 |

结论:**AI 生成轨与人工治理轨的合同(G3 校验/R1.2 待审/R1.4 环境指针)在真实使用下闭环成立**。

## 二、摩擦点清单(按阻塞度排序)

### 本轮已修(6 项)

| # | 摩擦点 | 修复 |
|---|---|---|
| F1 | **必填参数缺失静默空结果**——`list_review_submissions` 不传 appId 返回 `submissions: []`,agent 误判"无待审单"。对 AI 是误导性反馈,比报错危险 | `mcp-server.factory.ts` 新增 `requireParams` 统一守卫:以 TOOLS.inputSchema.required 为唯一事实源,缺失/空白返回结构化错误;所有工具受益 |
| F2 | **AI 无法创建应用**——MCP 无 create_application,从零生成第一步就断 | 新增 `create_application` 工具(容器操作即时生效,与人工建应用语义一致;应用内资源变更仍走人审) |
| F3 | **list_pages 返回全量 schema**——工具描述说"不含 schema"但返回完整 schema,agent 每次 token 浪费巨大 | `PageService.list` select 摘要投影;shared PageMeta.schema 改可选 |
| F4 | **提交 hint 不带 appId、不指引下一步**——agent 不知道怎么查批准、批准后拿什么(objectId/pageId) | 三处 submit hint 改为带 `list_review_submissions(appId="...")` 具体调用 + 依赖链指引 |
| F5 | **slug vs apiName 不一致**——DB 是 apiName,wire 输出 slug,submit 入参叫 apiName,agent 困惑 | PageMeta 双输出(`apiName` + `slug` 兼容别名);studio 本地类型同步 |
| F6 | **JWT 7 天无刷新**——MCP 客户端静态 header,到期全 401 | `POST /auth/refresh`:refreshToken(30d,派生密钥 `JWT_SECRET:refresh` 签发,access/refresh **双向不可互换已实测**);`scripts/refresh-mcp-token.sh` 一键续期写回 `~/.zcode/cli/config.json` |

### 未修——待规划(7 项,按建议优先级)

| # | 摩擦点 | 建议 |
|---|---|---|
| P1 | **资源依赖链强制分步人审**——表单页要 objectId(对象先批)、流程要 pageId(审批页先批),AI 无法单波提交完整应用,人需在线配合 3 轮 | 方向:批量提交 API(一次提交对象+页面+流程,草稿间用 apiName 互引,按拓扑顺序批准落地);或草稿引用解析(PENDING 草稿可引用 PENDING 草稿的 apiName) |
| P2 | **MCP 工具面不覆盖完整应用**——数据集/报表、权限规则、触发器配置、应用发布、环境管理无 MCP 工具,AI 只能生成"半套"应用(报表只能人工建) | 按需扩展 submit_dataset_draft / 权限草稿等;优先级看验收应用(采购合同)真实需要 |
| P3 | **AI 无法感知批准事件**——只能轮询 list_review_submissions | 方向:webhook 回调注册(MCP 工具 register_callback),或审核批准后 agent 侧通知 |
| P4 | publish API 字段名(version/description)不可从 MCP 面 | 低优先——Swagger 有;create_application hint 已给关键路径 |
| P5 | records 创建响应 `data.data` 双层嵌套 | API 形态怪癖,择机统一(注意兼容) |
| P6 | tasks 列表与详情字段名不一致(详情 taskName/列表 name) | 择机统一 |
| P7 | builder 自批自交(AI 提交+同一人审核) | 治理策略题:生产建议审核角色分离,ROADMAP 记录 |

## 三、修复明细(代码)

- `apps/gateway/src/mcp/mcp-server.factory.ts`:`requireParams` 导出守卫 + `create_application` 工具定义 + dispatch case + 头注释治理语义
- `apps/gateway/src/mcp/mcp.service.ts`:`createApplication()`(复用 ApplicationService.create + MCP_APP_CREATE 审计);三处 submit hint 改进
- `apps/gateway/src/mcp/mcp.module.ts`:import ApplicationModule
- `apps/gateway/src/page/page.service.ts`:list 摘要投影;toPageMeta 双输出 apiName(含两处 runtime bundle 构造)
- `packages/shared/src/page/index.ts`:PageMeta.schema 可选 + apiName 字段
- `packages/studio/src/api/pages.ts`:本地 PageMeta 同步(schema 可选/apiName 转正)
- `apps/gateway/src/auth/auth.service.ts`:login 签发 refreshToken;`refresh()`(派生密钥验签+用户/租户状态复核+轮换)
- `apps/gateway/src/auth/auth.controller.ts` + `dto/refresh-token.dto.ts`:POST /auth/refresh(限流桶同 login)
- `apps/gateway/src/config/env.validation.ts` + `.env(.example)`:JWT_REFRESH_EXPIRES_IN(30d 默认)
- `scripts/refresh-mcp-token.sh`:MCP token 一键续期(refresh 优先/过期回退 --login/写回 ZCode config)

## 四、测试与验证

- 单测:gateway 698(新增 12:MCP 守卫 5 + createApplication 1 + auth refresh 3 + 原有全绿)、studio 114、db 55、shared 17
- 实测:主线八步全通(见第一节);token 双向互换拒绝实测 401;续期脚本端到端(登录→refresh→写回→新 token 调 MCP 成功)
- 踩坑:macOS `$TMPDIR` ≠ `/tmp`(续期脚本首版路径分裂);zsh `$UID` 只读不可覆盖(脚本变量命名)

## 五、ZCode 客户端接入(用户侧)

- 配置位置:`~/.zcode/cli/config.json` → `mcp.servers.apaas`(type http + Bearer header;项目 `.zcode/config.json` 被 git 跟踪,**token 不可写那里**)
- 新会话自动连接;工具 13 个(get_dialect_guide 先行)
- 到期续期:`scripts/refresh-mcp-token.sh`(refreshToken 30d;全过期 `APAAS_PASSWORD=xxx scripts/refresh-mcp-token.sh --login`)

## 六、遗留与下一步

- P1(批量提交/草稿互引)是下一轮主线打磨最高价值项——"AI 单波生成完整应用"直接决定产品论成立度
- P2(工具面扩展)按采购合同验收应用真实需求裁剪
- 测试数据:demo 租户 `mcp_polish_leave` 应用(1 对象/2 页面/1 流程已发布)+ 资产管理应用 1 张 PENDING 草稿(mcp_test_feedback,可驳回清理)
