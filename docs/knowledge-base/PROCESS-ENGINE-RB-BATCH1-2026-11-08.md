# R-B 批 1 实现记录：functional 波次①②（2026-11-08）

- 依据：R-B 开工前裁决轮（2026-11-08，16 项全按推荐）+ 工单档 `ADVERSARIAL-REVIEW-PROCESS-FUNCTIONAL-2026-10-28.md` 波次①（发布预检与表单口径簇）②（删除守卫簇）
- 范围：R-B 第一批——5 工单（functional-02a/07/09/01/05）+ 盲批回退；PE 专项波次与 functional 波次③~⑥ 待后续批

## 一、交付内容

**波次① 发布预检与表单口径簇**：
1. **functional-02a**：shared node-check user_task 组合规则（`timeoutAction=AUTO_REJECT` 且无 `rejectToNodeId` → 不完整）；`nodeIncompleteReason(type, data?)` 签名扩展（动态专因「已配置超时自动驳回但未配置驳回跳转节点」，collectNodeIssues 传 data）；studio UserTaskConfigForm 超时动作区即时校验提示；process-engine.ts 超时 catch 注释勘误（「发布预检已拦」自此为真，标注防御层口径、升级处置由 functional-02b 承接）。
2. **functional-07**：UserTaskConfigForm 驳回目标选择器渲染条件 `allowReject === true` → `!== false`（与 :383 显示值、:470 回写区三口径统一，默认态即可配置）；**不加发布硬闸**（工单裁定：未配目标=不可驳回是合法存量语义，引擎 :637-642 硬闸不动）。
3. **functional-09**：node-check trigger 规则（`SCHEDULED` 无 `cron` → 不完整，专因「定时触发未配置 Cron 表达式」）；trigger.service 两处注册路径（单流程 :317 + 批量 :154）补防御 warn「定时触发缺 cron，未注册 job: apiName」（unregister 路径 :341 不动——清理语义无害）；TriggerConfigForm/Modal 不加假校验（画布标红同源）。

**波次② 删除守卫簇**：
4. **functional-01（◆1=A 存在即拦）**：deleteProcess 在 PUBLISHED 拦截之后补实例计数守卫——`processInstance.count > 0` → 409「该流程存在 N 条实例（含在途审批），删除将连带销毁全部执行历史；如需下线请使用取消/归档」；无实例放行（release 级联链 P1-30 保持）；「转为草稿编辑」降级链路不改（降草稿不删数据）。
5. **functional-05**：新增 `apps/gateway/src/shared/workflow-schema-refs.ts`（schema 引用收集，含 blocks 嵌套，camel/snake 双口径）——deletePage 扫描 user_task.pageId + trigger.startPageId、deleteTemplate 扫描 notification.templateId（同租户+同应用域，PUBLISHED+DRAFT 活表全量）→ 409 清单直出流程名；**审批页盲批回退**：ApprovalPageRenderer 增 `onLoadError` 回调 + 失败告警追加「（可查看下方申请内容）」，TaskCenter 增 `boundPageFailed` 状态（openTaskModal 重置），失败时 TaskDetailTabs 回退展示真实 triggerData/formData（原吞成空数组致盲批）。

## 二、验证

- 单测：shared node-check 17/17（新 4 例）；gateway process.service + page.service 26/26（新 7 例：实例守卫 2/模版引用 2/页面引用 3/SCHEDULED 发布 1）；`pnpm test` 11/11 包；typecheck 11/11。
- e2e 全量 **99/99**（smoke 含内）。
- **未执行清单（纪律③）**：TC-247 与 TC-250④ 的视觉结果未 GUI 实测——studio 无组件渲染测试基建（既有 175 单测全为纯逻辑单测，为新组件建 harness 超出本批范围）；盲批回退需人为构造「绑定页加载失败」场景（破坏 bundle 或 pageId）。两项以 typecheck+e2e 结构回归保证，留推送前 QA 走查/后续 GUI 轮执行。

## 三、踩坑

- **@apaas/shared dist 未重建导致 gateway 测试打旧逻辑**（e2e/测试三易错点再+1：gateway 跑 dist、shared 亦跑 dist——改 shared 后必须 `pnpm --filter @apaas/shared build` 再跑 gateway 测试）。症状：新 node-check 规则不生效 → publishProcess 放行 → 断言 getResponse not a function（err 实为发布成功的结果对象）。
- trigger.service 同名守卫有四处（:154 批量/:225/:317 单注册/:341 注销）——仅注册语义两处补 warn，注销路径缺 cron 无害不动。

## 四、批次状态

- functional 波次①② ✅（5 工单 + 盲批回退 + 横切 DOC-01 本批部分）；波次③（引擎语义簇 functional-04/02b）④⑤⑥ 与 S-01 扫描脚本待后续批；PE-01~32 七波次待后续批（开工前读 ADR-0007 与波次依赖 ②×③、④×⑤）。
- TC-246~250 入库 TEST-CASES v3.7（W 节）；QA-PLAN v1.0.22。
