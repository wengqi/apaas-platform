# DESIGN — iframe 嵌入集成（宿主系统集成第一轮）

- **日期**：2026-10-12
- **状态**：已实现（同提交落地；三项口径经用户裁决确认）
- **关联**：ADR-0003（amis 单方言/一切界面皆页面）、ADR-0004（开发者优先）、G6 开放 API（数据集成通道——本设计补的是 UI 集成通道）
- **分支**：feat/embed-iframe-integration

## 1. 背景与问题

构建态搭建的页面，运行时目前只能在本项目 runtime-ui 框架中渲染。外部宿主系统（企业既有门户/业务系统）需要把平台页面嵌入自己的界面，且要求：

1. 只保留构建态设计的 page 本体——剥掉运行时外壳（页头 `RuntimeLayout`、应用内页签 `AppNavMenu`、内容边距）；
2. 有标准的 iframe 内外通信方式，可交互数据。

方案选型（2026-10-12 讨论）：**A. iframe 嵌入**（本轮）/ B. 外部系统直渲 amis（后续可做）/ C. AmisRenderer 抽独立渲染包（平台化输出，另行立项）。

## 2. 用户裁决（2026-10-12）

| # | 裁决 | 内容 |
|---|---|---|
| ① | AppNavMenu 去留 | **去掉**。页签导航是平台外壳而非 page 的一部分；导航职责归宿主系统自建菜单，经协议 `apaas:navigate` 驱动切页 |
| ② | page-event 出站范围 | **只桥 dispatchEvent 自定义事件**（经 `embedEvent` 自定义 amis 动作显式转发），不外泄 amis 内部事件噪音 |
| ③ | 宿主身份 | **第一版用现有 JWT 直传**（URL hash 引导 + `apaas:auth` 轮换）；token 交换端点（宿主后端服务凭证换用户短时 token）留待后续 |

## 3. 架构

```
宿主系统页面                    平台 runtime-ui（iframe, 跨域）
┌────────────────┐   postMessage   ┌───────────────────────────┐
│ createApaasEmbed│ ──apaas:hello──▶ │ EmbedBridge（hello-first） │
│ (packages/shared)│◀─ready/route-── │        ↓                   │
│                  │   change/       │ EmbedPage（干净路由）      │
│  宿主自建导航     │   page-event/   │   └ AmisRenderer          │
│  业务事件消费     │   height-...    │     （唯一渲染路径）       │
└────────────────┘ ──auth/context─▶ └───────────────────────────┘
                                     GET /api/v1/...（JWT Bearer）
```

- **协议 SSOT**：`packages/shared/src/embed/protocol.ts`（信封 + 类型常量 + 载荷契约 + 守卫），两端共享。
- **宿主 SDK**：`packages/shared/src/embed/host-client.ts`（`createApaasEmbed`，零依赖 vanilla TS，任意框架可用），子路径导出 `@apaas/shared/embed`。
- **iframe 侧**：`runtime-ui/src/embed/`——`embedBridge.ts`（协议桥）、`EmbedPage.tsx`（干净页面 + 桥装配）、`embedActions.ts`（embedEvent 动作注册）、`EmbedDemo.tsx`（宿主模拟器）。

## 4. 干净页面：`/embed/app/:appId/p/:slug`

- 路由置于 `ProtectedRoute`/`RuntimeLayout` 之外——天然无页头/无页签/无边距/无登录重定向。
- 401 分流：embed 模式不跳 `/login`（iframe 内**永不渲染登录页**），axios 拦截器广播 `apaas:embed:auth-expired` 事件，桥转协议出站，宿主接管（换 token 重发或提示）。
- schema 根节点注入确定作用域名 `embedPage`（已有 name 不覆盖），`query-data` 经 amis Scoped `getComponentByName` 读取页面数据域（`AmisRenderer` 新增 `scopeRef` 注入口，透传 render 第二参——amis-core `Scoped.js:466` 官方挂载点）。
- 环境沿用 `?env=`；`apaas:hello/context` 可在线切换。

## 5. 协议（embed protocol v1）

信封：`{ v: 1, type: 'apaas:*', msgId?, payload?, ts }`。

| 方向 | type | 载荷要点 |
|---|---|---|
| 宿主→iframe | `apaas:hello` | 握手首消息：自报 origin + 初始 token/env/context |
| iframe→宿主 | `apaas:ready` | schema 就绪（appId/slug/name/env/authenticated） |
| iframe→宿主 | `apaas:auth-expired` | 401（带触发路径） |
| iframe→宿主 | `apaas:route-change` | 页内切换后的新 slug |
| iframe→宿主 | `apaas:page-event` | 仅 embedEvent 动作显式转发（裁决②） |
| iframe→宿主 | `apaas:height-change` | ResizeObserver 事件驱动，宿主自适应高度 |
| 宿主→iframe | `apaas:auth` | token 轮换 |
| 宿主→iframe | `apaas:context` | env 切换 + 页面输入数据域**全量替换** |
| 宿主→iframe | `apaas:navigate` | 宿主驱动切页 |
| 双向 rpc | `apaas:query-data`(:result) | 带 msgId 回执；source=page（作用域快照）\|context（注入域兜底） |

**协议规则**：① 带 msgId 必回执；② 未识别 type 静默忽略（版本异步升级）；③ 出入站 origin 校验 + 显式 targetOrigin（禁 `'*'`）。

### hello-first 握手（含 ack 重试）

生产 nginx `Referrer-Policy: no-referrer` 使 iframe 无法从 `document.referrer` 推得宿主 origin——iframe 在收到首条 `apaas:hello` 前保持静默（出站帧缓冲），从 hello 的 `event.origin` 学到宿主 origin 后一次性放行。hello 自报 origin 与 `event.origin` 不符视为伪造丢弃（同源情形下亦复核）。

**实测修正（2026-10-12 走查）**：src 同步设置时，iframe 的 `load` 事件对应**初始 about:blank 文档**（Chrome）——hello 会落进随即被真实 SPA 文档替换的将死窗口而永久丢失。修复：SDK 发 hello 带 **ack 重试**（自续 setTimeout 500ms，收到 iframe 任何回帧即停，上限=握手超时 15s）；宿主出站协议帧在 ack 前一律缓冲。这是有界连接握手重试（等价 WebSocket 重连语义），非 no-polling 原则所禁的状态同步轮询。

## 6. 认证（裁决③：JWT 直传 v1）

- **引导**：`#token=`（既有 `initAuthFromHash()`，读后清理 URL）或 hello 携带。
- **轮换**：`apaas:auth`。401 出站 `auth-expired`，宿主接管。
- **边界（明确）**：iframe 内 token 是谁，行级权限就按谁在服务端结算——宿主传什么 token 就是谁的身份。宿主侧伪造他人 token 即绕过平台权限，v1 以管理信任为前提；生产化后续做 token 交换端点。

## 7. 部署与配置

- **nginx**（`infra/nginx/app.conf`）：新增 `/embed/` 专用 location，仅对嵌入路由放宽 `frame-ancestors`（部署时把 `'self'` 改为宿主 origin 白名单）；主应用路由维持 `'self'`。注意 nginx `add_header` 不跨层继承——该 location 内完整重复了其余安全头。
- **runtime-ui**：`VITE_EMBED_ALLOWED_ORIGINS`（逗号分隔宿主 origin 白名单；同源默认放行），与 nginx 白名单保持一致（前者管协议入站，后者管浏览器 framing）。
- **G3**：`KNOWN_ACTION_TYPES` 新增 `embedEvent`（显式契约，不依赖校验器遍历缝隙）；方言指南修订随 MCP 侧轮次补充。

## 8. 走查证据（2026-10-12，采购合同应用 contract_list）

全项通过（截图 `gui-test-screenshots/embed-demo-walkthrough.png`）：干净页面渲染（无页头/页签）→ ready(authenticated=true) → query-data(source=page) → navigate 切页 → route-change+新页 ready → context 注入 → 二次 query-data 含注入字段 → embedEvent 按钮出站 page-event: host-ping → 坏 token 注入后 401 全部转 auth-expired 且不跳登录 → height-change 驱动宿主自适应高度。

单测：shared 协议 4 例 + runtime-ui 桥 7 例 + G3 校验器 4 例（jsdom 限制：postMessage 事件不回填 origin/source，入站用合成 MessageEvent 驱动，真实管线由走查覆盖）。

## 9. 已知边界与后续

- **跨域场景**未实测（走查为同源 iframe；协议层设计即为跨域服务：origin 白名单/targetOrigin 显式——部署 nginx 白名单后即可用，建议集成时第一个宿主做一次跨域联调）。
- 登录态用户信息（user 对象）在纯 hash/hello 场景为 null（只承诺 token 可用），页面内依赖 `user` 的展示（如创建人姓名解析）走服务端渲染路径不受影响。
- 后续候选：token 交换端点（宿主后端→平台换用户短时 token）、外部系统直渲 amis（方案 B）、AmisRenderer 独立包（方案 C）。
