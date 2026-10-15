# 门户定位轨与管理抽屉修复轮（2026-10-13）

> 素蓝设计轮（SUILAN-DESIGN-2026-10-13）交付后的用户 QA 修复轮，studio + runtime 双端。
> 分支 `feat/suilan-design-2026-10-13` 追加提交；全部缺陷先红灯复现后修复。

## 一、缺陷清单与根因

### D1 定位轨抢滚（studio，用户报：点击分组不选中 + 滚动卡顿）

- **现象**：点击右轨分组后落定在错误分组；手动滚动时页面被反复拽动。
- **根因**：`GroupLocatorRail` 注释自述契约"scrollspy 回调仅设状态、禁止触发滚动"，但
  `DevCenterHome` 把会滚动的 `locateGroup` 同时传给了 spy 回调——spy 越界回调 →
  再次 `scrollIntoView` → 两个平滑滚动互相取消。复现实测：点击「研发」落定「市场」，
  一次点击 3 次 `scrollIntoView`；纯用户滚动期间 2 次 `scrollIntoView`+1 次 `scrollTo`。
- **次因**：每 scroll tick 全量 `querySelectorAll`+N 次 `getBoundingClientRect` 无节流；
  `onSelect` 每渲染新建致监听每渲染重订阅；固定 160px 判定线在滚动到底时永远选不中底部分组。
- **修法**：选中状态内化到轨道（高亮是纯视觉状态，卡片视图正文不消费它，状态更新不再波及
  整页卡片）；点击=定位+选中并压制 spy（滚动静默 150ms 解除、3s 硬上限、wheel/touchmove
  立即交还）；rAF 每帧最多测量一次；到底规则（`innerHeight+scrollY ≥ scrollHeight-2` →
  最后分组）；`CSS.escape` 分组名。
- **教训**：注释契约防不住错误接线——守卫应固化为断言（用户滚动期间程序化滚动必须 0 次，
  本轮复现脚本即守卫）。

### D2 管理抽屉「未分组」行假编辑器（用户报：默认空输入框+保存、点击没反应）

- **现象**：打开「管理分组」抽屉，最后一行默认就是一个空输入框+保存，点什么都没反应。
- **根因**：行渲染条件 `renaming === g.name`——「未分组」的 `g.name=null`，而 `renaming`
  初始值也是 `null`，`null===null` 恒真 → 未分组行**永远**渲染成编辑态；保存事件
  `g.name && rename(g.name)` 被 null 短路，永远无效。
- **修法**：`renaming !== null && renaming === g.name`（编辑态必须显式激活）。
- **教训**：①哨兵比较双方都可能为 null 时恒真，必须显式排除；②测试桩必须覆盖真实数据形状
  （用户有 12 个未分组应用，桩里一个都没造，三轮验证全绿是假绿）。DB 只读直查
  （psql 查 `applications."group"`）是快速排除脏数据假设的手段。

### D3 抽屉 rename/remove 静默吞错（D2 同一次会话定性的伴生缺陷）

- **根因**：`withBusy` 只有 `finally` 无 `catch`，API 失败（403 无权限/400 校验/网络）
  无任何用户可见反馈，体验即"点击没反应"；伴生发现 `appsApi.updateGroup` 用
  `res.data.data as {updated}` 直取，非契约响应在调用点炸无提示 TypeError（D-011 同类）。
- **修法**：两处 try/catch + `apiErrorMessage` 透出后端真实原因（编辑器保持打开可重试）；
  API 层契约防御（`data.updated` 缺失显式报"分组接口响应格式异常"）。
- **教训**：自写 async（非 react-query mutation）最容易漏接错误；`as` 断言掩盖契约漂移。

### D4 runtime 定位轨行为缺位（用户报：按 studio 同样修复；列表模式大纲应隐藏）

- **现状核实**：runtime 原本**没有 scrollspy**（无抢滚但也无跟随），高亮永远停在初始行；
  列表模式右轨仍然渲染。
- **修法**：抽 `PortalGroupRail.tsx`（studio 同构移植，行为+视觉 v8.2 完全对齐）；
  `Home.tsx` 大纲改 `viewMode === 'card'` 条件渲染，删列表视图死分支；顺带拆
  `PortalAppCard.tsx` 使 Home 回到 400 行内（594→369）。

### D5 「＋ 新建分组」按钮与创建应用弹框相同（用户裁决：撤除）

- 按钮 `onClick={openCreate}` 是素蓝轮占位接线；数据模型"分组随应用产生"
  （`applications.group` 派生、无独立建组存储）下独立建组语义不成立。用户三选一裁决撤除。
- 建组能力保留：创建应用分组字段 / 卡片「移动到分组」/ 管理分组抽屉（footer 文案已说明）。

### D6 v8.2 视觉对齐（用户逐项提出）

- studio：去「全部应用」行、总数上移「分 组」头行右对齐（跟随搜索过滤）、交互提示吸附轨底
  （sticky bottom+页面底色）、分组行缩进归零。
- runtime：同形态移植（用户确认双端一致）。

## 二、验证口径

- 每个缺陷先构造可重放红灯（Playwright + `page.route` API 桩，不依赖后端、不碰真实数据；
  脏数据假设用 psql 只读查询排除）。
- studio：tsc / eslint 0 warning / 175 单测；runtime：27 单测；双端构建+preview 实测断言+截图。
- runtime 跟随验证与几何规则对拍时两次红灯均为**期望函数错**（漏"到底规则"分支、手算分节
  高度错），非代码缺陷——期望函数必须与实现同一语义，且滚动位置会被 maxScroll 钳制
  （scrollTo(1100) 实际落 730）。

## 三、工程坑（复用价值高）

1. **Playwright 路由桩 glob 陷阱**：`*` 不匹配 `/`——`**/api/apps*` 匹配不到
   `/api/apps/groups`（静默落到兜底桩返回错误契约，假红灯）。拦带子路径的 API 用正则
   `/\/api\/apps/`。
2. **桩必须按 resourceType 只拦 xhr/fetch**：vite dev 的源码模块 URL 也含 `/api/`
   （如 `/src/api/apps.js`），glob 桩会把模块拦成 JSON 使页面白屏。
3. **vite preview 改码需重建+浏览器强刷**：5173/5174 都是 preview 服务 dist；
   studio 构建需 `NODE_OPTIONS="--max-old-space-size=8192"`（裸跑 OOM exit 134）。
4. **ESM 临时脚本放仓库根**：`/tmp` 下脚本无法解析仓库 node_modules。

## 四、遗留与建议

- 双端定位轨是两份同构拷贝（shared 无 React 依赖，下沉属架构决策未动）——再演化时考虑。
- 无权限账号进「管理分组」抽屉：现在会显式弹"无权限"（不再静默）；按权限隐藏入口未做，
  待产品定。
- 定位轨 spy 契约建议固化为自动化守卫（滚动期间 0 次程序化滚动断言），本轮以复现脚本
  人工执行，未入常规套件。
