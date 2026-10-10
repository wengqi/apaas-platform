# GUI 黑盒走查报告 — R5 遗留修复轮（2026-10-10）

> 范围：用户裁决四问题修复轮中涉及 GUI 的两项（runtime 应用列表过滤、超管空态提示）+ 相关回归观察。
> 方法：web-gui-tester 黑盒走查（真实浏览器操作 + API 对照），截图留档本目录。
> 前置：gateway 重启后运行（本机 root .env / apps/gateway/.env 均含 THROTTLE 放开值）；runtime-ui 为当日新构建 preview。

## 通过点（全部操作到结果可见）

| # | 场景 | 操作 | 实际结果 | 证据 |
|---|---|---|---|---|
| 1 | 终端用户应用列表（TC-155） | `user@apaas.dev` 经 UI 登录 5174 → /home | 16 张应用卡片，全部为 PUBLISHED 应用；6 个 DRAFT（qa_builder_app、e2e_1791078111762、app_5940f2 等）不可见 | qa_tc155_runtime_home_published_only.png |
| 2 | API 对照（admin，TENANT_ADMIN） | `GET /apps` vs `GET /apps?runtime=1` | 全量 22（16 PUBLISHED + 6 DRAFT）；runtime=1 = 16 全 PUBLISHED——这正是用户观察"22 个含 DRAFT"的来源口径 | 会话记录（curl 输出） |
| 3 | API 对照（END_USER 种子通配） | 同上双端点 | runtime=1 = 16 全 PUBLISHED；无参数仍 22（studio 兼容语义不变） | 会话记录 |
| 4 | 超管 UI 登录路径 | `superadmin@apaas.dev` 租户留空提交 | 租户必填校验拦下（红字"请输入租户标识"），请求不到后端——超管无法经 UI 进入 runtime（见问题点①） | qa_tc154_superadmin_login_blocked.png |
| 5 | 超管 token 注入路径（TC-154 兜底） | 注入 `apaas:auth`（超管 token + isPlatformAdmin 用户）→ /home | 显式空态"平台管理员无租户上下文，请以租户账号登录运行时"+ 返回登录按钮，非静默"暂无可用应用" | qa_tc154_superadmin_home_empty_state.png |
| 6 | 空态二级交互 | 点击"返回登录" | 登出生效（apaas:auth 清空为 null）并跳回 /login | 会话记录 |
| 7 | 超管 API 直连 | `GET /apps?runtime=1`（超管 token） | 400 + 中文"平台管理员无租户上下文，请通过租户管理操作"（Home 空态文案的响应匹配源） | 会话记录 |

## 问题点 / 已知边界（非本轮缺陷，已如实登记）

1. **登录页 UI 路径超管不可达**：租户标识必填校验（底册 D 既有设计）使超管提交即被拦，Login.tsx 新增的 isPlatformAdmin 分流分支在纯 UI 路径不可达——保留为 API 层防线（防未来校验放宽/SSO 直登）。TC-154 步骤/预期已按实测改写。
2. **台账 crud 列 map 中文未渲染（P2）**：本轮裁决不处理（根因=存量 schema 无 mapping 配置，生成器/渲染器无问题，见 R5 实现记录 2026-10-10 处置节）。

## e2e 环境修复验证（非 GUI，附记）

- `pnpm test:e2e:smoke` **17/17 全绿**（此前失败集合：16 test2-4、22×2、23 test1 全部转绿；22 新增 runtime 视图断言）。
- 根因定案与修复内容见 `docs/knowledge-base/AI-MAINLINE-R5-QUALITY-TELEMETRY-2026-10-09.md` 2026-10-10 处置节。
