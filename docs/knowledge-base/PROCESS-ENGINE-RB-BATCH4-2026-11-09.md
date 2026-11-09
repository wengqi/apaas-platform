# R-B 批 4 实现记录：functional 波次⑥ 审批操作入口（2026-11-09）——专项收官

- 依据：R-B 裁决轮（2026-11-08，◆4=A 转办入口随加签同面板）+ 工单档波次⑥（3.7，functional-08，零后端改动）
- 范围：functional-08（runtime-ui 加签/撤回/转办入口）——**functional 专项 9 工单自此全清**

## 一、交付内容

**functional-08（TC-257/258/259）**：
1. **发起人撤回（TC-257）**：「我发起的」进行中行（RUNNING/WAITING_USER_TASK，`canWithdraw` 纯函数判定）显示「撤回」入口 + 二次确认 → `POST /instances/:id/withdraw`；成功后实例 TERMINATED、全部待办作废、列表刷新；非发起人/终态拒绝由后端 403/400，`apiErrorMessage` 提取 `response.data.error.message` **直达 toast**（不吞成通用文案）。
2. **受理人加签（TC-258）**：任务弹窗「加签」入口——被加签人 ID 手输 + 位置选择（after=依次补审/parallel=并行会签）→ `POST /tasks/:taskId/add-sign`；成功后刷新待办（新任务随被加签人出现并推进，后端 R1.3 既有语义）。
3. **转办入口（TC-259，◆4=A）**：任务弹窗「转办」入口（新受理人 ID 手输 + 「移交后离开你的待办」提示）→ 消费既有 `POST /tasks/:taskId/delegate`；此前转办仅 studio 监控页单入口（tasksApi.delegate 死方法转活），R1.3 加签/转办/撤回三件套在运行时对齐。

**选人形态（用户裁决 2026-11-09）**：手输用户 ID——runtime-ui 现无 END_USER 可用的用户列表 API（org members 端点 TenantAdmin-only，直接列表会撞 security-03 同族 PII 面）；组织成员选人器留后续轮（需单独裁决只读 id+name 端点的信息面）。

## 二、验证

- 单测：runtime-ui utils 7/7（新增 canWithdraw 状态判定 + apiErrorMessage 后端语义提取 2 例，TDD 修正 undefined 防御）；runtime-ui tsc 0 错。
- typecheck 11/11、e2e 全量 **99/99**（runtime-ui dist 重建后回归）。
- **未执行清单（纪律③）**：TC-257/258/259 的 GUI 场景走查未执行——需多用户在途任务夹具（撤回需非发起人对照、加签推进需第二受理人登录），留推送前 QA 走查轮；UI 消费的三个后端端点均有既有 e2e/单测锚定（R1.3/R5.5）。

## 三、踩坑

- **TC 编号撞号二次勘误**：批 3 把 TC-256 分配给 S-01 工具，与 functional 档顺延表（波次⑥=TC-256~258）冲突——波次⑥ 顺延为 TC-257~259、PE 专项自 TC-260 起（两工单档已同步勘误）。教训：批量顺延表要与实际入库节奏对账，每批入库时先核对现库尾号。
- apiErrorMessage 需对 undefined 入参防御（`err ?? {}`）——axios 拦截器外的裸调用场景。

## 四、批次状态

- **functional 专项 9/9 工单全清**（批 1：01/02a/05/07/09 + 批 2：04/02b + 批 3：03/06 + 批 4：08；横切 S-01 ✅、RES-01 ✅、DOC-01 随批同步）。
- 余：**PE-01~32 七波次**（开工先读 ADR-0007 与波次依赖 ②×③、④×⑤）；2026-11-08 全项目对抗审查 30 确认（2H）待工单化排期（用户裁决先继续 R-B，未落档）。
- TC-257~259 入库 TEST-CASES v3.10；QA-PLAN v1.0.25。
