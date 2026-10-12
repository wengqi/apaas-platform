# iframe 嵌入集成实现记录（2026-10-12）

> 分支 feat/embed-iframe-integration。设计文档：`docs/design/DESIGN-embed-iframe-2026-10-12.md`（三项用户裁决同源）。本文件记实现与踩坑。

## 交付清单

| 包 | 文件 | 内容 |
|---|---|---|
| shared | `src/embed/protocol.ts` | 协议 SSOT：信封/11 消息类型/载荷契约/isEmbedFrame 守卫（版本+类型白名单） |
| shared | `src/embed/host-client.ts` | 宿主 SDK `createApaasEmbed`（零依赖；hello ack 重试/outbox/rpc pending 表/握手超时） |
| shared | `package.json` | 新增 `./embed` 子路径导出 |
| runtime-ui | `src/embed/embedBridge.ts` | iframe 侧桥：hello-first 握手/origin 白名单/出站缓冲/活跃桥单例 |
| runtime-ui | `src/embed/EmbedPage.tsx` | `/embed` 干净页面 + 桥装配（401 分流/ready/route-change/高度 RO/query-data） |
| runtime-ui | `src/embed/embedActions.ts` | `registerAction('embedEvent')`——page-event 出站唯一通道（裁决②） |
| runtime-ui | `src/embed/EmbedDemo.tsx` + 路由 `/embed-demo` | 宿主模拟器（走查/联调载体，用真实 SDK） |
| runtime-ui | `src/api/client.ts` | embed 模式标记：401 广播事件不跳登录 |
| runtime-ui | `src/runtime/AmisRenderer.tsx` | 新增 `scopeRef` 注入口（透传 render 第二参到 Scoped HOC） |
| gateway | `schema-contract/validators/amis-page.validator.ts` | KNOWN_ACTION_TYPES + `embedEvent`（+新 spec 4 例） |
| infra | `nginx/app.conf` | `/embed/` location：frame-ancestors 放宽位 + 安全头完整重复 |

测试：shared 34 / runtime-ui 27 / gateway validator 4 全绿；typecheck + lint + build 全绿。走查：TC-156/157/158 全项通过（截图 `gui-test-screenshots/embed-demo-walkthrough.png`，测试夹具页面 `embed_event_demo` 已随 2.0.135795 发布，留作回归）。

## 踩坑实录（本轮实测挖出）

1. **iframe load 事件对应初始 about:blank（Chrome，src 同步设置时）**：SDK 在 load 时发 hello，实测 hello 送达的是即将被 SPA 文档替换的将死窗口（双侧探针定位：iframe 侧早期监听器在 t≈插入时刻收到 hello，但新文档里的桥永远等不到）。修复 = hello ack 重试（自续 setTimeout 500ms，收任何回帧即停）+ ack 前出站帧缓冲。**判别手法**：父页挂 message 探针（空）+ iframe contentWindow 内挂早期监听（收到了）+ 手动补发 hello（缓冲帧立即吐出）三方对照。
2. **桥生命周期 effect 被页内导航重建**：装配 effect 依赖含 `navigate`（useNavigate 返回值身份随路由变化）→ 协议 navigate 切页时 cleanup `bridge.stop()` 清掉 parentOrigin，新桥重新静默等 hello → 切页后宿主收不到任何回帧。修复 = effect 依赖恒空，可变值全部经 ref 间接引用。**症状特征**：切页后"桥聋了"但页面正常渲染。
3. **jsdom 的 postMessage 不回填 origin（空串）且 source ≠ window**：桥单测的两大入站防线无法经真实管线触发（探针实测）。单测改用合成 `MessageEvent`（显式 origin/source）；真实管线由 /embed-demo 浏览器走查覆盖。
4. **nginx `add_header` 不跨层继承**：location 内一旦出现自己的 add_header，server 级全部失效——`/embed/` location 必须完整重复 X-Content-Type-Options/Referrer-Policy。另注意 CSP 字符串内 `#` 是字面量，白名单示例只能写在注释行。
5. **ESLint no-restricted-syntax 拦 setInterval**：握手重试改自续 setTimeout（规则只限 setInterval 语法）；在代码注释与设计文档中写明"有界握手重试 ≠ 状态同步轮询"的例外口径。
6. **G3 校验器真实拦截**：建测试页时 `type: "text"` 被拒（应为 `tpl`）——校验器对 API 建页路径同样生效（正面证据）。
7. **坏 token 注入会污染共享登录态**：apaas:auth → zustand persist 会覆盖 localStorage `apaas:auth`（同源 iframe 与宿主共享）——走查注入无效 token 后必须恢复，否则用户浏览器登录态被破坏。
8. **应用发布版本号**：采购合同应用版本已到 2.0.x，发布走 `POST /apps/:id/publish {version, description}`（x.y.z 格式且不得重复）；页面级 publish 不进 AppVersion bundle，运行时 /embed 读 bundle——测试页必须走应用级发布。

## 协议要点备忘

- iframe 在 hello 前完全静默（出站缓冲 ≤32 帧），握手后 targetOrigin 恒定。
- `query-data` 的 source 字段诚实区分：page=amis 作用域快照（MST 对象经 JSON 摊平，proxy 不能直接过 structuredClone）；context=注入域兜底。
- ready 的 authenticated 只承诺"有 token"不承诺"token 有效"（有效性由 401→auth-expired 通道反馈）。
- 出站方向的消息出现在入站侧 / 未识别类型：一律静默忽略（向前兼容）。
