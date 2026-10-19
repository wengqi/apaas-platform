# 状态矩阵 — 2026-10-19（应用归属 + design/runtime 双命名空间，ADR-0005）

> 分支 `feat/app-ownership-design-runtime-split`。裁决：grilling 两轮 Q1–Q13 + Q6-1~4 用户全确认
> （方案 b=所有权+协作成员表；`/design` 前缀一次到位）。ADR：`docs/adr/0005-app-ownership-design-runtime-namespaces.md`。
> 实现记录：`docs/knowledge-base/APP-OWNERSHIP-DESIGN-RUNTIME-2026-10-19.md`（含裁决后修正与踩坑）。

## 一、交付矩阵

| 交付项 | 内容 | 状态 | 证据 |
|---|---|---|---|
| ① 路由双命名空间 | 设计面 ~80 条全量迁 `/api/v1/design/apps/:appId/**`（嵌套应用下）；运行面拔 `?runtime=1`、`pages/runtime/:pid`→`pages/:pid`、共用读端点服务端只回已发布 | ✅ 五族提交 e43a4ad..945bc8d | 全量 e2e 既有 92 例全部迁移后 95 过（纯搬家零语义漂移） |
| ② 归属数据模型 | `application_members`（OWNER partial unique 唯一 + MEMBER）+ 迁移（created_by 回填）+ seed 幂等（OWNER 回填 + builder→procurement MEMBER 协作夹具） | ✅ e495848 | 本地 32 应用 OWNER 32 行（admin 22/builder 10）；seed 复跑幂等 |
| ③ 成员闸 | `AppAccessService`（单一判定源）+ `DesignAccessGuard`（hasStudioAccess 纵深+归属）挂 13 设计面控制器 + 静态锚定测试 + MCP dispatch 同源断言 | ✅ e495848 | TDD 25 例；design-routes-guarded 4 例 |
| ④ 成员管理 API | 清单/候选（租户级 BUILDER 未入会）/增删/转移所有权（原 owner 降 MEMBER，同事务）+ 审计动作三枚举入 shared SSOT | ✅ 170bf41 | TDD 10 例 |
| ⑤ studio UI | 治理组「成员」页（MEMBER 只读）、卡片「由 X 共享」、深链 403 页、卡片菜单按 myRole 门控 | ✅ a03b1ff | studio 182 单测绿；tsc 0 错 |
| ⑥ 归属 e2e | e2e/25 八例：可见集/403 不透露所有者/MEMBER 边界/转移（恰一 OWNER）/候选集/END_USER 纵深/运行面不受影响 | ✅ d392365 | 8/8 |
| ⑦ 文档 | ADR-0005、TC-196~199、QA-PLAN v1.0.15（环境事实+锚点+API 路径口径）、AGENTS 当前阶段、本矩阵、实现记录 | ✅ 本提交 | — |

## 二、验证快照

| 闸 | 结果 |
|---|---|
| 根 typecheck | 11/11 ✅ |
| 根单测 | 11/11 ✅（gateway 903 = +38；studio 182；runtime-ui 32；shared 44；db 55） |
| 全量 e2e | 99 例：95 过；e2e/22 本地既知假警（夹具被人工标 is_internal，CI 新库过）；25 号两处响应形状夹具修正后 8/8 |
| seed 幂等 | 复跑通过 ✅ |

## 三、裁决后修正（诚实记录）

1. 原探讨稿「闸盖 `/apps/:appId/**` 前缀」不成立——搭建写操作多为资源 ID 直达路由；
   最终以全量嵌套 + 服务层 appId 域解决（顺带封跨应用 IDOR，反查表不需要）。
2. `getRuntimeById`「降级活表」系控制器注释失实（代码本就 404 无兜底），已勘误未改行为。
3. Q2「runtime 不动」修正为零语义改动（runtime-ui 4 调用点机械更新）。

## 四、遗留与观察哨

- GUI 四身份走查截图与 OCR 评审随推送流程执行（本矩阵更新于推送前）。
- `?env=` 环境键参数保留（非模式开关）；若未来多环境 UI 扩张可再议路径化。
- 运行面 `GET /apps` 对 admin 返回全部已发布（含 isInternal 直链可达，仅列表过滤）——现状语义未变。
- builder 名下应用数变化（+procurement 协作）后，QA 矩阵 {admin,builder}×应用数口径按 QA-PLAN v1.0.15 为准。
