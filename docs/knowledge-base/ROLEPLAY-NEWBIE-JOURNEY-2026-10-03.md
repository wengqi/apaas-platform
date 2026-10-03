# 零知识用户旅程(A/B 角色扮演)——2026-10-03

> 方法:角色 A(零知识新手,只可提问、不可读文档/自行修复)在 studio UI 上从零构建「设备报修」应用,角色 B(专家)答疑、接收全部反馈、修复、交 A 验收。与 MCP 主线打磨(AI 第一公民轨)互补——本轮测**纯人工 UI 新手可用性**,每一步真实浏览器执行。

## 一、旅程主线(A 独立完成,全程无代码知识)

登录 → 创建应用「设备报修」→ 对象「报修单」(5 系统字段自动 + 5 业务字段,含 2 个单选各 4 选项)→ 页面×2(表单页/列表页,**对象字段自动生成模板**)→ 发布 0.1.0 → 运行时提交报修单 → 台账查看 → 修复后重发布 0.1.1 → 复验。

**结论:零知识用户可独立完成"对象+页面+发布+运行"闭环**;流程编排(流程)未在本旅程覆盖(flowgram 画布,后续轮次)。

## 二、A 反馈全清单与处置

| # | A 的反馈(B 定性) | 处置 | 验收 |
|---|---|---|---|
| H1 | 提交表单点"提交"无任何反馈,连点 3 次=3 条重复记录(高危) | ①模板 form 加 `messages.success/failed` + `resetAfterSubmit`(重置+防重复);②AmisRenderer 加 notify 桥接(AntD message) | 重置+防重复 ✅(每击一条);**toast 仍未显示**——amis 裸 render() 的 options.notify 未进 env,记录为 H1b 未竟项 |
| H2 | 台账"紧急程度/状态"列显示 UUID 乱码(高危) | page-template `selectOptions`:`value ?? o.id` → `value ?? o.label`(注释本就声称回退 label,实现背离) | ✅ 台账显示"低/中/高/紧急/待处理" |
| H3 | 版本历史"发布人"显示用户 ID(高危) | 根因:前端二次查 `/permissions/users` 需管理员权限,builder 403。后端 `listVersions` join users 直出 `publishedByName` | ✅ 显示"搭建者" |
| M1 | API 名称必填无自动生成,对象/字段/页面三处重复摩擦(中) | 引入 pinyin-pro:`suggestApiNameFromLabel`(显示名称→拼音 snake_case),升级对象/流程/页面三处建议值+补齐字段弹窗(最高频处原本完全没有) | ✅ "报修提交"→`bao_xiu_ti_jiao`,可手改 |
| M2 | 顶栏"发布/发布历史"按钮易混淆,A 实测误点(低) | 文案统一"版本历史" | ✅ |
| M4 | 应用创建成功后停在列表,无下一步引导(低) | onSuccess 自动 navigate 进新应用工作台 | 已落地(未显式复验) |
| — | 登录页"租户标识"不可自解释;字段"存储值"等术语无内建解释;首页无示例/教程入口;首访无引导(记录) | 未修,列产品 backlog | — |

### 旅程中 B 侧踩的坑(工程)

- **studio/runtime-ui 均为 `vite preview`(serve 构产物)非 dev server**——改源码必须 rebuild+重启才生效,A 验收 M1 时曾因此误判修复无效
- AntD Form `onChange` 里 `form.getFieldValue` 读到旧值(表单值未同步),自动转写须取 `e.target.value`——三处弹窗首版全错,A 验收抓出
- 旧测试断言 H2 缺陷行为(id 当 value)——测试与实现同错,按新语义改写用例(显式 value 保留+缺省回退 label 双断言)
- studio 构建需 `NODE_OPTIONS=--max-old-space-size=8192`(已知坑)

## 三、遗留(H1b 根因线索)

amis 6.13 裸 `render(schema, props, options)` 传入的 `notify` 未被 form saveRemote 链路使用(提交成功 msg='提交成功' 时仍无任何 toast 节点挂载)。下一步:查 amis-core `render()` 的 env 合成(是否需 SDK 形态 `amisEmbed`/显式注册 ToastComponent),或改在 fetcher 成功分支对 POST 自行弹提示。**不阻塞业务(防重复已由 resetAfterSubmit 结构性解决)**。

## 四、本轮测试数据

demo 租户「设备报修」应用(app_116372):repair_order 对象 + 2 页面(bao_xiu_ti_jiao/repair_list)+ 0.1.0/0.1.1 两版本 + 6 条报修记录(选项值均为业务可读值)。可整应用删除清理。
