# 删旧优先：v1 运行时轨 + R1.4 兜底腿退役（2026-10-02）

> R1.7 第二轮前置批次。前提共识：**平台未上线、无存量部署，不需要任何兼容层**——
> 为不存在的存量用户保留的兜底路径全部物理删除，双轨并存窗口压缩到零。

## 背景

R1.7 第一轮（PR #13）采用"先建新、最后删旧"顺序（画布 amis 化 → 裁剪 → v1 下线），
这是为已上线产品设计的节奏；对未上线产品，双轨并行的每一天都是纯开销（双份测试/
e2e/校验路径）。本批次把"删旧"提前，后续 ② 画布 amis-editor 重写、③ studio v1
搭建器下线在单方言基线上进行。

## 删除清单

### 1. v1 运行时渲染轨（runtime-ui）

- 删除 `runtime/ComponentRenderer.tsx`（307 行）、`runtime/ModalHost.tsx`、
  `runtime/RuntimeStore.tsx`（vm/autoQuery/动作链语义随之退役）
- `PageView.tsx` 单方言化：amis → `AmisRenderer` 唯一路径，删除 `isAmisPage` 分流
- `ApprovalPageRenderer`：`appId` 改必填（任务 DTO 随 `processDef.appId` 恒存在），
  删除 `pagesApi.get(pageId)` 活表死分支；`api/tasks.ts` 类型收紧为 `appId: string`
- `api/pages.ts` 删除孤儿方法 `pagesApi.get`

### 2. R1.4 兜底腿（gateway）

- `environment-resolver.service.ts`：删除 `legacyFallbackRaw`（旧快照腿），
  `ResolvedEnvironment` 接口删除 `bundleMode`，收敛为 `bundle: AppSnapshot | null`
  （null = 该环境未部署）
- 调用方语义收紧（全部无活表兜底）：
  - `page.service.getRuntimeById`：bundle 不含该页面即 404
  - `record.service`（getObjectEnvFields + update 路径）：**已部署**取 bundle 内不可变
    字段定义（bundle 内不存在该对象 → 空）；**未部署取活表字段——这是搭建期语义而非
    兼容兜底**（建对象后、发布前的记录试录依赖 AutoNumber/Formula/校验，首轮 e2e/13
    排序与 e2e/14 流程写库红实锤误删 证实误删，已恢复并诚实标注）
  - `trigger.service`（rebuildForEnvironment + onRecordEvent）：**已部署**环境以 bundle
    为唯一语义源（触发器随环境启停）；**未部署**环境为搭建期，按活表 PUBLISHED 匹配
    （联动/定时流程发布即生效——首轮 e2e/14 联动断言红证实误删，已恢复并诚实标注）
- **保留**：`process-engine.start` 的流程级 PUBLISHED 活表分支——这不是历史包袱，
  而是现役产品语义：流程可独立于应用部署单独发布（流程发布不切环境指针），
  手动启动按流程自身 PUBLISHED 定义执行；自动触发走环境 bundle

### 3. `Application.publishedSnapshot` 列（物理删除）

- 旧快照的唯一读者就是被删的 `legacyFallbackRaw`；写者（publish/rollback/seed）
  全部改为 AppVersion + 指针语义后，列成为纯死重
- Prisma 迁移 `20261002000000_drop_application_published_snapshot`：`ALTER TABLE
  applications DROP COLUMN published_snapshot`
- shared `ApplicationDto` 删除 `publishedSnapshot` 字段（studio 零引用，实证安全）

### 4. seed 走 R1.4 原生路径（不再回无指针基线）

旧 seed 刻意清空环境指针（"种子回无指针基线保证幂等"）——意味着演示数据全靠兜底
链在跑，兜底腿实际是 seed 的主路径。新 seed 发布段：

1. 建 `AppVersion`（1.0.0，PUBLISHED，快照）——重跑刷新快照内容（幂等）
2. upsert `AppEnvironment` dev/prod，指针指向该版本；指针变化才记 `Deployment`
3. `Application.status/publishedAt` + 子资源发布状态同步

## 新不变量

- **运行时读路径唯一**：`AppEnvironment.currentVersionId → AppVersion.snapshot`
  （${env.*} 实时替换）；无环境行/未部署/指针悬空 → bundle=null
- **环境二分语义（本轮沉淀的核心规则）**：
  - **已部署环境**：bundle 是唯一语义源——页面/审批页/字段定义/触发器全部取不可变
    快照，活表零泄漏；
  - **未部署环境 = 搭建期**：活表即其语义源——记录字段解析与触发器匹配取活表
    PUBLISHED 定义（支撑建对象→试录→联动验证的搭建闭环），**这是现役开发体验，
    不是历史兼容**；已发布元数据读路径（publishedSnapshot 旧快照腿）不在此列，
    物理删除不变
- **页面唯一方言 = amis**；runtime-ui 不得包 React.StrictMode（红线不变）
- **手动启动流程**按流程级 PUBLISHED 定义执行（流程发布独立于应用部署）

## 测试处置说明（红线：修改测试须写明理由）

- `environment-resolver.service.spec.ts`：降级链用例按新语义重写（断言"未部署=null、
  无兜底"）——测试的是被删除的行为，产品语义迁移而非回避
- `record.service.spec.ts`：AutoNumber 两用例原先依赖活表字段兜底（bundle=null 时
  落活表 fields），改为显式配置 bundle 字段——与新字段解析语义一致
- `e2e/10-demo-app.spec.ts`：`publishedSnapshot` 详情断言改为 `publishedAt` +
  运行时 slug 可读（发布/部署语义等价迁移）

## 验证

- gateway 单测 656/656、runtime-ui 10/10、全量 build 通过
- `prisma migrate reset` + 全新 seed（AppVersion + 双环境指针）后 e2e 全绿
- 踩坑：playwright `reuseExistingServer` 会复用**旧构建的 gateway 进程**——DB schema
  变更后旧进程的 prisma client 查已删除的列会系统性失败（所有套件首用例全红）。
  跑 e2e 前先杀 :3000/:5173 旧进程

## 后续

- ② studio 画布 amis-editor 重写（单方言基线，无 v1 中间态）
- ③ studio v1 搭建器物理下线（~17k 行）+ `isAmisPage` 方言合同退役 + G3 单路径
- 组件矩阵裁剪 86→30 退化为"配 amis-editor setter 白名单"，自建注册表整体消失
