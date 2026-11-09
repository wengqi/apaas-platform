# PE 波次①之一实现记录：PE-02 + PE-03（2026-11-09）

- 依据：PE 工单档波次①（启动·身份·取消安全 3 条）；PE-01（三层组合大改）留波次①之二单独批
- 范围：PE-02（cancel 归属校验〔H〕）+ PE-03（triggeredByUser 伪造〔M〕）

## 交付
1. **PE-02**：`cancelInstance` 增 `userId` 参数——复用 `assertInstanceVisible`（超管/租户管理员/发起人/任务参与人，M-2 既有口径）做归属校验，非归属者 403；`userId` 缺省=内部调用不受限（定时/系统路径兼容）；controller 传 `req.user.id`。对齐 withdrawInstance 惯例（工单指定修法）。
2. **PE-03**：`startInstance` 发起人注入改 `callerUserId ?? req.triggeredByUser ?? null`——JWT 用户通道 caller 强制覆盖 body 伪造值；显式值仅保留给无 caller 的服务身份通道（OpenAPI 直调 engine.startProcess 不经本方法；webhook 两者皆不传不受影响）。**A3 语义修订（R2-compat-07）**：R1 轮「显式传入优先」→「用户通道强制覆盖」，本记录即落档点（R1 档 PROCESS-ENGINE-TOPIC-R1-INITIATOR-2026-10-11.md 的 A3 节以本记录为准）。
3. 测试：process-start-instance.spec 8/8（PE-03 重写「显式优先」锚定为 caller 覆盖 + 新增服务身份保留/PE-02 四路：403/发起人/受理人/内部调用）——旧锚定测试语义被 PE-03 推翻，修订理由即工单本身（伪造向量为缺陷）。

## 验证
全量 `pnpm test` 11/11 + typecheck 11/11；TC-260（PE-03）/TC-261（PE-02）入库 TEST-CASES v3.11；QA-PLAN v1.0.26。

## 余
波次①之二：PE-01（◆1=a+c 三层：controller 闸 extractTriggerInfo 判定+保留键全谱剥离+引擎写 permissionContext 强制+listPublishedProcesses 过滤）——单独批 TDD。
