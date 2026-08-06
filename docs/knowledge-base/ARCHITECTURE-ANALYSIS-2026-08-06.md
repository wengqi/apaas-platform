# 技术选型架构审阅与演进计划 — 2026-08-06

> 本文档基于对 aPaaS monorepo 全域源码、package.json、锁文件、Docker/Nginx 配置的完整调研，
> 从高级技术架构师视角审阅技术选型合理性，并给出分阶段演进计划。
> 评估视角：**开发阶段**（非生产上线），优先级按"最阻碍开发效率与代码质量"校准。
> 调研范围：`apps/gateway`、`packages/{studio,runtime-ui,shared,db,meta-svc,process-svc,runtime-svc}`、`infra/`、根配置。

---

## 一、技术栈全景

### 1.1 工程层

| 项 | 版本 | 说明 |
|---|---|---|
| 包管理器 | pnpm 9.15.9 | `packageManager` 固定，workspace + `workspace:*` 内部引用 |
| 构建编排 | Turborepo 2.10.7 | 声明 `^2.3.3`，任务：build/dev/lint/test/generate |
| Node.js | 20 LTS | `.nvmrc` = `20`，`engines.node >=20.0.0` |
| TypeScript | 5.9.3 | 声明 `^5.6.3`，`target: ES2022`、`strict: true` |
| 代码格式化 | Prettier 3.9.6 | 单引号、100 列、trailingComma all |
| 代码检查 | ESLint | ⚠️ 后端包声明了 lint 脚本但无依赖/配置，形同虚设 |

### 1.2 前端层

| 项 | studio（搭建器） | runtime-ui（运行时） | 说明 |
|---|---|---|---|
| 核心框架 | React 18.3.1 | React 18.3.1 | 两包一致 |
| 构建工具 | Vite 6.4.3 | Vite 6.4.3 | `@vitejs/plugin-react 4.7.0` |
| UI 组件库 | Ant Design 5.29.3 | Ant Design 5.29.3 | `@ant-design/icons 5.6.1` |
| CSS 方案 | Tailwind CSS 3.4.19 | Tailwind CSS 3.4.19 | + PostCSS + Autoprefixer |
| 状态管理（客户端） | Zustand 5.0.14 | Zustand 5.0.14 | `create<T>()` store |
| 状态管理（服务端） | @tanstack/react-query 5.101.4 | @tanstack/react-query 5.101.4 | `QueryClientProvider`，`retry:1` |
| 路由 | React Router 6.30.4 | React Router 6.30.4 | `BrowserRouter` |
| HTTP 请求 | axios 1.19.0 | axios 1.19.0 | `axios.create()` + token 拦截器 |
| 流程编排 | @flowgram.ai 全家桶 1.0.12（~30 子包） | — | fixed-layout-editor 核心 |
| 拖拽 | @dnd-kit/core 6.3.1 + sortable 10.0.0 | — | 页面搭建器 |
| 代码编辑器 | @uiw/react-codemirror 4.25.11 | — | + autocomplete + lang-javascript |
| 查询构建器 | @react-awesome-query-builder/antd 6.6.15 | — | 可视化条件构建 |
| 表达式引擎 | expr-eval 2.0.2 + json-logic-js 2.0.5 | — | 前端校验 + 规则引擎 |
| 工具库 | dayjs 1.11.21 | dayjs 1.11.21 | 时间处理 |

### 1.3 后端层

| 项 | 版本 | 说明 |
|---|---|---|
| 核心框架 | NestJS 10.4.22 | `@nestjs/platform-express`（Express 平台） |
| 配置管理 | @nestjs/config 3.3.0 | `ConfigModule.forRoot({ isGlobal: true })`，**无 validationSchema** |
| 认证 | @nestjs/jwt 10.2.0 + @nestjs/passport 10.0.3 | passport-jwt 4.0.1，Bearer token |
| 密码哈希 | bcrypt 5.1.1 | |
| 验证 | class-validator 0.15.1 + class-transformer 0.5.1 | 全局 `ValidationPipe`（whitelist + transform + forbidNonWhitelisted） |
| ORM | Prisma 5.22.0 | `@apaas/db` 包导出共享 `prisma` 单例 |
| 队列 | BullMQ 5.81.3 | `process-queue` + `delay-queue`，Worker 并发 5 |
| Redis 客户端 | ioredis 5.11.1 | BullMQ 后端 |
| 表达式引擎 | json-logic-js 2.0.5 + expr-eval 2.0.2 | 权限条件 + 公式引擎 |
| 邮件 | nodemailer 9.0.3 | `notification/mail.service.ts` |
| 测试框架 | vitest 2.1.9 | 已声明但**无配置文件、无用例** |
| API 文档 | — | ❌ 未集成 Swagger/OpenAPI |

### 1.4 数据与基础设施层

| 项 | 版本/说明 |
|---|---|
| 数据库 | PostgreSQL 16（`postgres:16-alpine`） |
| 缓存 | Redis 7（`redis:7-alpine`，AOF 持久化） |
| 存储模式 | JSONB 宽表（`records.data` JSONB + GIN 索引）+ 多租户 `tenant_id` 行级隔离 |
| Schema 规模 | ~22 model + 8 enum |
| 迁移文件 | 5 个（`20260731` ~ `20260801`），仅前进式 `migrate deploy` |

### 1.5 部署层

| 项 | 说明 |
|---|---|
| Docker | 多阶段 Dockerfile（`node:20-alpine`），3 target：gateway / studio / runtime-ui |
| Nginx | SPA 托管（`try_files → /index.html`）+ `/api` 反代 `http://gateway:3000` |
| Compose | 两套：`infra/` 仅 PG+Redis（本地开发）；根目录 compose 全量部署 |
| CI/CD | ❌ 未配置 |

---

## 二、工程化缺口核查

### 2.1 测试覆盖 — ❌ 完全缺失

- 全项目 **0 个** `.test.ts` / `.spec.ts` 文件
- 无 `vitest.config.ts`（前端仅有 `vite.config.ts` 构建配置）
- `apps/gateway/package.json:11` 声明 `"test": "vitest run"`，`vitest ^2.1.5` 已安装为 devDep，但**无配置、无用例**，`turbo run test` 空转
- 无 coverage 配置

### 2.2 全局错误处理 — ❌ 缺失

- 无 `ExceptionFilter`，`apps/gateway/src/main.ts:1-35` 未调用 `useGlobalFilters`
- `apps/gateway/src/app.module.ts:14-29` 无 `APP_FILTER` 全局 provider
- Prisma 异常（如 `P2002` 唯一约束冲突）未转译为业务友好 HTTP 响应
- 所有未捕获异常走 NestJS 默认层，响应格式不统一

### 2.3 日志与可观测性 — ❌ 缺失

- 无结构化日志库（winston/pino/nestjs-pino 均**零命中**）
- 无请求日志拦截器（`LoggingInterceptor` 零命中）
- 无 APM/监控（sentry/prometheus/opentelemetry 均**零命中**）
- 全项目用 NestJS 默认 `Logger`（非结构化控制台文本），如 `auth.service.ts:16`、`process-engine.ts:35` 等十余处

### 2.4 安全中间件 — ⚠️ 多数缺失

- **helmet**：❌ 未安装（全项目零命中）
- **速率限制**：❌ 未安装（`@nestjs/throttler` 零命中）
- **CORS**：gateway 已配 `origin`（`main.ts:20-28`，读 `CORS_ORIGINS` 环境变量）；但三个微服务 `enableCors({ credentials: true })` **未设 origin**（`meta-svc/src/main.ts:8` 等），等价于全开放
- **CSRF**：❌ 未配置（纯 API + JWT 场景风险有限）
- **JWT_SECRET**：`.env` 中为 `dev-secret-change-me`，无强度校验

### 2.5 API 版本控制 — ❌ 缺失

- `enableVersioning` / `VersioningType` / `VERSION_NEUTRAL` 均**零命中**
- 路由前缀仅 `/api`（gateway）、`/api/meta` 等（微服务），**无 `/api/v1` 版本段**

### 2.6 数据库迁移 — ⚠️ 有迁移、无回滚

- 5 个迁移文件：`20260731145945_init_with_apps` → `20260801093929_add_app_publish_models`
- `packages/db/package.json:8-14` 仅 `migrate dev`（开发）+ `migrate:deploy`（生产，仅前进）
- 无回滚脚本、无 down 迁移

### 2.7 环境变量管理 — ⚠️ 有示例、无校验

- `.env.example` 完整（32 行，含 PG/Redis/JWT/端口/前端配置）
- `ConfigModule.forRoot({ isGlobal: true })`（`app.module.ts:16`）**未传 `validationSchema`**
- 搜索 `Joi`、`zod`、`envSchema` 均**零命中**
- 缺失必填项时静默用 `undefined`，不 fail-fast

### 2.8 代码规范 — ⚠️ Prettier 有、ESLint 无效

- Prettier 3.9.6 已配置（`.prettierrc`）
- 4 个后端包声明 `"lint": "eslint src --ext .ts"`，但**全仓库无 eslint 依赖、无配置文件**
- 前端用 `tsc --noEmit` 代替（只能查类型错误，不能查代码风格/hooks 规则）
- 无 husky / lint-staged / commitlint，提交前无任何检查

### 2.8 核查汇总

| # | 维度 | 结论 |
|---|------|------|
| 1 | 测试覆盖 | ❌ 0 文件 / 无配置 / 无 coverage |
| 2 | 全局错误处理 | ❌ 无 ExceptionFilter / Prisma 异常未转译 |
| 3 | 日志与可观测性 | ❌ 无结构化日志 / 无拦截器 / 无 APM |
| 4 | 安全中间件 | ⚠️ 无 helmet / 无限流 / 微服务 CORS 全开放 |
| 5 | API 版本控制 | ❌ 无 enableVersioning，前缀无版本号 |
| 6 | 数据库迁移 | ⚠️ 5 个迁移文件，无回滚策略 |
| 7 | 环境变量管理 | ⚠️ 有 .env.example，无 Joi/zod 校验 |
| 8 | 代码规范 | ⚠️ Prettier 有，ESLint 形同虚设，无提交钩子 |

---

## 三、开发阶段优先级校准

### 3.1 为什么生产视角不适用

项目当前处于**开发阶段**（Phase 0-4 + Phase 9 核心功能已实现，第二阶段前端功能补全待开始）。此阶段的特点：

- **无生产流量**：安全中间件（helmet/throttler）、结构化日志、错误监控的风险不会实际发生
- **代码量增长最快**：第二阶段前端功能补全 + Phase 5-8 新功能扩展，代码量将大幅增长
- **迭代速度是第一优先级**：每多一个无测试保障的重构，都在积累风险
- **前后端并行开发**：API 文档是协作刚需，不是锦上添花
- **越晚加成本越高的项**：API 版本控制、ESLint 规范——每多写一个 endpoint / 多提交一次代码，改造成本 +1

### 3.2 优先级重估对照表

| 问题 | 生产视角优先级 | 开发阶段优先级 | 理由 |
|------|-------------|-------------|------|
| 零测试 | 🔴 阻断上线 | 🔴 **立即** | 每次重构都在盲改，拖慢迭代 |
| 无 API 文档 | 🟡 重要 | 🔴 **立即** | 前后端协作刚需，shared DTO 已有契约却没有可浏览文档 |
| ESLint 无效 | 🟡 重要 | 🔴 **立即** | 代码量增长最快阶段，无规范保障加速腐化 |
| 环境变量无校验 | 🔴 阻断上线 | 🔴 **立即** | 配置错误静默失败，浪费调试时间 |
| 无 API 版本控制 | 🟡 重要 | 🔴 **立即** | 现在加一行，以后改所有路由 |
| 无全局错误处理 | 🟡 重要 | 🔴 **立即** | Prisma 异常未转译，调试效率低 |
| class-validator → Zod | 🟡 重要 | 🟡 中期 | 新模块可用 Zod，存量渐进迁移 |
| Node.js 20 → 22 | 🔴 阻断上线 | 🟡 中期 | 无生产流量，EOL 风险暂不触发 |
| CI/CD | 🟡 重要 | 🟡 中期 | 先有测试和 lint，CI 才有意义 |
| Prisma tenant_id 注入 | 🟡 重要 | 🟡 中期 | 防止跨租户泄漏，开发期可加 middleware |
| 安全中间件 | 🔴 阻断上线 | 🟢 延后 | 无生产流量，上线前补齐即可 |
| 结构化日志 | 🟡 重要 | 🟢 延后 | 开发阶段 console 够用 |
| 错误监控（Sentry） | 🟡 重要 | 🟢 延后 | 无生产流量 |
| 迁移回滚策略 | 🟡 重要 | 🟢 延后 | 开发阶段可重建数据库 |
| 微服务 CORS 修复 | 🔴 安全 | 🟢 延后 | 微服务未进生产 compose |

---

## 四、开发阶段最需解决的问题（🔴 立即）

### 4.1 零测试基础设施

**问题**：全项目 0 个测试文件。自研流程引擎（`process-engine.ts` 状态机）、权限条件翻译器（`condition-translator.ts`）、公式引擎（`formula-engine.ts`）均为高风险逻辑，无任何测试覆盖。`vitest` 已安装为 devDep 但无配置文件。

**风险**：
- 流程引擎状态机逻辑 bug → 流程死锁/跳节点
- 权限翻译器 bug → 跨租户数据泄漏
- 公式引擎 bug → 计算字段错误
- 每次重构都在"盲改"，无安全网拖慢迭代速度

**建议**：
- 配置 `apps/gateway/vitest.config.ts`（coverage 阈值初始 40%）
- 优先补测试的模块（按风险排序）：
  1. `apps/gateway/src/process/process-engine.ts` — 状态机流转、分支条件、并行节点
  2. `apps/gateway/src/permission/condition-translator.ts` — json-logic → Prisma where 翻译
  3. `apps/gateway/src/object/formula-engine.ts` — expr-eval 公式求值
  4. `apps/gateway/src/permission/permission.guard.ts` — 权限守卫
- 前端：`packages/studio/src/stores/` 的 Zustand store + 关键组件用 Vitest + React Testing Library
- `turbo.json` 的 test 任务已有 `dependsOn: ["build"]`，无需改配置

### 4.2 无 API 文档（Swagger/OpenAPI）

**问题**：API-first 的 aPaaS 平台，前后端共享 `@apaas/shared` 的 DTO 类型契约，却未集成 `@nestjs/swagger`。前端开发只能靠读 controller 源码对接口，DTO 变更无文档追踪。

**风险**：
- 前后端协作效率低，每个接口都要口头沟通或读源码
- DTO 字段变更无文档追踪，前端容易漏改
- 未来 API 被外部应用消费（自定义按钮、工作流 API 节点）时无参考

**建议**：
- 安装 `@nestjs/swagger`
- `apps/gateway/src/main.ts` 挂载：
  ```ts
  const config = new DocumentBuilder()
    .setTitle('aPaaS Gateway API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  ```
- 各 Controller 加 `@ApiTags`、`@ApiOperation`，DTO 加 `@ApiProperty`
- DTO 已有 `class-validator` 装饰器（`@IsString` 等），`@nestjs/swagger` 可复用，迁移成本低
- 开发环境访问 `http://localhost:3000/api/docs`，生产环境可关闭

### 4.3 ESLint 形同虚设 + 无提交钩子

**问题**：4 个后端包（gateway、meta-svc、process-svc、runtime-svc）声明 `"lint": "eslint src --ext .ts"`，但全仓库无 eslint 依赖、无配置文件。前端用 `tsc --noEmit` 代替（只能查类型错误，不能查代码风格/hooks 规则）。无 husky / lint-staged。

**风险**：
- 代码规范无强制保障，代码量增长最快阶段加速腐化
- React Hooks 误用（如条件调用 hooks）`tsc` 查不出来，`eslint-plugin-react-hooks` 才能抓
- 提交前无任何检查，坏代码直接进主干

**建议**：
- 安装 ESLint 9（flat config）+ `@typescript-eslint/eslint-plugin` + `eslint-plugin-react` + `eslint-plugin-react-hooks`
- 根目录创建 `eslint.config.js`（flat config 格式）
- 后端 lint 脚本改为 `eslint src --ext .ts`（依赖到位后即可工作）
- 前端补 `eslint-plugin-react-hooks` 的 rules-of-hooks + exhaustive-deps 检查
- 安装 `husky` + `lint-staged`，pre-commit 钩子执行 `prettier --write` + `eslint --fix`
- 根 `package.json` 加 `prepare: "husky"` 脚本

### 4.4 环境变量无校验

**问题**：`ConfigModule.forRoot({ isGlobal: true })`（`app.module.ts:16`）未传 `validationSchema`。`JWT_SECRET`、`DATABASE_URL`、`REDIS_URL` 等必填项缺失时不会在启动期失败。`.env` 中 `JWT_SECRET=dev-secret-change-me`。

**风险**：
- 配置错误静默失败，问题在运行时才暴露，浪费调试时间
- 生产部署若忘记覆盖 `JWT_SECRET`，以可预测密钥启动
- 开发者 clone 项目后配错 `.env`，排查困难

**建议**：
- 安装 `joi`（或用 `zod`，与 4.8 节的 Zod 迁移方向一致）
- 创建 `apps/gateway/src/config/env.validation.ts`：
  ```ts
  import * as Joi from 'joi';
  export const envValidation = Joi.object({
    DATABASE_URL: Joi.string().required(),
    REDIS_URL: Joi.string().required(),
    JWT_SECRET: Joi.string().min(16).required(),
    JWT_EXPIRES_IN: Joi.string().default('7d'),
    GATEWAY_PORT: Joi.number().default(3000),
    // ...
  });
  ```
- `app.module.ts` 改为 `ConfigModule.forRoot({ isGlobal: true, validationSchema: envValidation })`
- 三个微服务骨架同步加校验

### 4.5 无 API 版本控制

**问题**：路由前缀仅 `/api`（`main.ts:9`），无版本段。aPaaS 平台的 API 会被外部应用消费（自定义按钮跳转、工作流 API 节点等），破坏性变更无法通过版本隔离。

**风险**：
- 越晚加成本越高——每多写一个 endpoint，改造成本 +1
- 未来 API 变更将破坏已发布应用的兼容性

**建议**：
- `apps/gateway/src/main.ts` 启用版本控制：
  ```ts
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  ```
- 路由自动变为 `/api/v1/...`
- 现有 Controller 无需改动（继承 `defaultVersion: '1'`）
- 三个微服务骨架同步加（如果后续会承载业务）
- **越早加越好**，现在只需改一行

### 4.6 无全局错误处理

**问题**：无 `ExceptionFilter`，`main.ts` 未注册 `useGlobalFilters`。Prisma 异常未转译为业务友好 HTTP 响应。所有未捕获异常走 NestJS 默认层，可能泄漏堆栈信息。

**风险**：
- 错误响应格式不统一，前端难以统一处理
- Prisma 异常（`P2002` 唯一约束、`P2025` 记录不存在等）直接暴露为 500，前端无法区分
- 开发阶段调试效率低——错误信息不可预测

**建议**：
- 创建 `apps/gateway/src/common/filters/all-exceptions.filter.ts`：
  - 统一响应格式 `{ code: number, message: string, data: null }`
  - 生产环境隐藏堆栈，开发环境保留
- 创建 `apps/gateway/src/common/filters/prisma-exception.filter.ts`：
  - `P2002`（唯一约束冲突）→ 409 Conflict
  - `P2025`（记录不存在）→ 404 Not Found
  - `P2003`（外键约束）→ 400 Bad Request
- `main.ts` 注册：`app.useGlobalFilters(new AllExceptionsFilter(), new PrismaExceptionFilter())`
- 或在 `app.module.ts` 用 `{ provide: APP_FILTER, useClass: ... }` 注册

---

## 五、中期技术债（🟡 开发阶段推进）

### 5.1 class-validator → Zod 渐进迁移

**现状**：使用 `class-validator 0.15.1` + `class-transformer 0.5.1`，依赖 `reflect-metadata`，运行时类型安全是"假"的。

**建议**：
- 新模块优先用 `nestjs-zod`（NestJS 官方推荐）
- `@apaas/shared` 中的 DTO 尤其适合用 Zod——前后端共享同一 schema，前端可直接复用做表单校验
- 存量 DTO 渐进迁移，不必一次性重写
- Zod 单一库同时做运行时校验 + 类型推导（`z.infer<typeof schema>`），与 TypeScript 类型系统天然一体

### 5.2 Node.js 20 → 22 升级

**现状**：Node 20 维护期已于 2026-04 结束，当前运行在无安全补丁的运行时上。

**建议**：
- 升级到 **Node 22 LTS**（维护期至 2027-04）
- 同步更新 `.nvmrc`（`22`）、`engines.node`（`>=22.0.0`）、Dockerfile 基础镜像（`node:22-alpine`）
- bcrypt 原生模块需重新编译验证
- 开发阶段无生产流量，升级风险可控，可在功能开发间隙完成

### 5.3 CI/CD 最小流水线

**现状**：无 GitHub Actions / GitLab CI / Jenkins。代码推送无自动检查。

**建议**：
- **先有测试和 lint（第四章 4.1/4.3），CI 才有意义**
- 最小 CI（GitHub Actions）：
  ```yaml
  jobs:
    ci:
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v4
        - uses: actions/setup-node@v4
          with: { node-version: 22, cache: pnpm }
        - run: pnpm install --frozen-lockfile
        - run: pnpm lint
        - run: pnpm test
        - run: pnpm build
  ```
- PR 必须通过 CI 才能合并
- CD 后期：Docker 镜像构建 + 推送 + 服务器拉取重启

### 5.4 Prisma tenant_id 强制注入

**现状**：多租户靠应用层手动注入 `tenant_id` where 条件。任何一个 service 方法忘记注入就会跨租户泄漏。

**建议**：
- 用 Prisma 的 `$extends` 或 client extension 在查询层强制注入 `tenant_id`
- 或用 NestJS 的 `APP_INTERCEPTOR` 在 Prisma 查询前注入 tenant 上下文
- 近期先做 middleware 级保障，中期启用 PostgreSQL Row Level Security 兜底

---

## 六、生产前补齐项（🟢 延后至上线前）

> 以下问题在开发阶段风险可控（无生产流量），但**必须在上线前完成**。

### 6.1 安全中间件

- 安装 `helmet`，`app.use(helmet())` — 安全响应头
- 安装 `@nestjs/throttler`，登录接口强制限速（如 10 次/分钟）
- `JWT_SECRET` 启动校验：长度 < 32 字符则拒绝启动（与 4.4 环境变量校验合并）

### 6.2 结构化日志

- 引入 `nestjs-pino`（Pino 是 Node.js 最快 JSON 日志库）
- 自动结构化所有请求日志，配合 `pino-pretty` 做开发态美化
- 替换全项目十余处 `new Logger()` 调用

### 6.3 错误监控

- 集成 `@sentry/nestjs`，未捕获异常自动上报
- 配合 4.6 的全局 ExceptionFilter，在 filter 中上报 Sentry

### 6.4 数据库迁移回滚策略

- 迁移 SQL 中对破坏性变更使用分阶段策略（先加列 → 填充数据 → 再加约束）
- 维护手工回滚 SQL 脚本目录（`migrations/rollback/`）
- 生产迁移前在 staging 环境完整验证

### 6.5 微服务 CORS 修复

- `meta-svc`、`runtime-svc`、`process-svc` 的 `enableCors({ credentials: true })` 必须显式设 `origin`
- 或直接关闭 CORS（内部服务不应暴露浏览器访问）
- 当前微服务未进根目录 docker-compose，但拆分时需先修

---

## 七、架构层面长期思考

### 7.1 flowgram.ai 依赖锁定风险

**现状**：studio 依赖约 30 个 `@flowgram.ai/*` 子包（全部锁定 1.0.12），是流程编排核心引擎。

**风险**：
- flowgram.ai 是字节跳动开源项目，社区规模远小于 AntV/X6、ReactFlow 等竞品
- 30 个子包的耦合深度意味着替换成本极高
- 若项目停止维护或方向调整，迁移代价巨大

**建议**：
- 不必立即替换，但持续在 `@apaas/shared` 层面维护流程 schema 的 SSOT 定义（已在做），确保流程数据模型不与 flowgram 内部结构耦合
- 评估流程编排核心能力是否可降级到更轻量方案（如 ReactFlow + 自研节点面板）
- 持续关注 flowgram.ai 维护活跃度

### 7.2 自研流程引擎演进方向

**现状**：BullMQ + 状态机自研流程引擎，无外部 BPMN 引擎。

**优势**：轻量可控，与 NestJS 生态融合好。

**劣势**：
- 缺乏成熟引擎的故障恢复、补偿事务、子流程、超时重试能力
- BullMQ Worker 崩溃后的流程恢复机制需自行保障
- 流程审计/追踪能力薄弱（仅 `NodeExecution` 表，无完整执行链路可视化）

**建议**：
- 短期维持自研，补充幂等性保障（每节点执行带唯一 token + 状态检查）和超时/死信处理
- 中期评估 **Temporal**（开源 workflow orchestration，Go 后端 + TypeScript SDK），durable execution 模型天然适合流程引擎

### 7.3 JSONB 宽表扩展性

**现状**：`records` 表用 `data JSONB` 存储所有对象字段值，配 GIN 索引。

**风险**：
- 单表数据量增长后（百万级），JSONB 查询性能下降，GIN 索引膨胀
- 跨对象关联查询需在 JSONB 内做 join，无法用外键
- 排序/分页基于 JSONB 内字段时需表达式索引（Prisma 不直接支持）

**建议**：
- 近期：确保热查询字段有表达式索引（`CREATE INDEX ON records ((data->>'field_name'))`）
- 中期：对高频对象做物化视图或独立表拆分
- 长期：评估 PostgreSQL 分区策略（按 `tenant_id` 或 `object_id` 分区）

### 7.4 多租户隔离升级路径

**现状**：`tenant_id` 字段行级隔离，靠应用层注入 where 条件。

**建议**：
- 近期：Prisma `$extends` 强制注入 `tenant_id`（见 5.4）
- 中期：启用 PostgreSQL Row Level Security（`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`）
- 远期（大租户场景）：评估 schema-per-tenant 或 database-per-tenant 隔离

---

## 八、演进路线图

```
立即（1-2 周）— 开发效率与代码质量
├── 配置 vitest + 核心模块测试（process-engine / condition-translator / formula-engine）
├── 集成 @nestjs/swagger + DTO 装饰器 → /api/docs
├── 安装 ESLint 9 flat config + husky + lint-staged
├── Joi 环境变量校验 + JWT_SECRET 强度检查
├── main.ts 启用 API 版本控制（/api/v1）
└── 全局 ExceptionFilter + Prisma 异常转译

中期（2-4 周）— 技术债清理
├── class-validator → Zod 渐进迁移（新模块先行）
├── Node.js 20 → 22 升级
├── CI/CD 最小流水线（lint + test + build）
├── Prisma tenant_id 强制注入
└── 核心模块测试覆盖率提升至 60%+

生产前 — 安全与可观测
├── helmet + @nestjs/throttler + JWT_SECRET 强制校验
├── nestjs-pino 结构化日志
├── Sentry 错误监控
├── 数据库迁移回滚策略
└── 微服务 CORS 修复

长期 — 架构演进
├── flowgram.ai 依赖评估与降耦合
├── 自研流程引擎完善 / Temporal 评估
├── JSONB 宽表分区/物化视图策略
└── PostgreSQL RLS + 多租户隔离升级
```

---

## 九、技术栈速查图

```
┌─ 工程层 ─────────────────────────────────────────────┐
│  pnpm 9.15.9 workspace + Turborepo 2.10.7            │
│  TypeScript 5.9.3 / Node 20 LTS（→ 22）              │
│  Prettier 3.9.6 / ESLint 9（待补齐）                  │
└──────────────────────────────────────────────────────┘
┌─ 前端层 ─────────────────────────────────────────────┐
│  React 18.3.1 + Vite 6.4.3 + Tailwind 3.4            │
│  UI: Ant Design 5.29.3                               │
│  状态: Zustand 5.0.14 (client) + React Query 5.101.4 │
│  路由: React Router 6.30.4  HTTP: axios 1.19.0       │
│  studio 专属: flowgram.ai 1.0.12 / dnd-kit /         │
│    CodeMirror / react-awesome-query-builder /        │
│    expr-eval + json-logic-js                         │
└──────────────────────────────────────────────────────┘
┌─ 后端层 ─────────────────────────────────────────────┐
│  NestJS 10.4.22 (Express) + TypeScript               │
│  ORM: Prisma 5.22.0                                  │
│  认证: JWT + Passport + bcrypt                        │
│  验证: class-validator（→ Zod 渐进迁移）             │
│  队列: BullMQ 5.81.3  规则: json-logic-js + expr-eval│
│  API 文档: @nestjs/swagger（待集成）                  │
└──────────────────────────────────────────────────────┘
┌─ 数据/基础设施层 ────────────────────────────────────┐
│  PostgreSQL 16 (JSONB 宽表 + 多租户行级隔离)         │
│  Redis 7 (BullMQ 后端)                               │
└──────────────────────────────────────────────────────┘
┌─ 部署层 ─────────────────────────────────────────────┐
│  Docker Compose (多阶段 Dockerfile)                  │
│  Nginx (SPA 托管 + /api 反代 gateway)                │
│  CI/CD: 待建设                                       │
└──────────────────────────────────────────────────────┘
```

---

## 附录：核心结论

**选型方向正确，核心栈成熟合理。** pnpm+Turborepo、React+Vite+AntD、Zustand+ReactQuery 双层状态、NestJS+Prisma+BullMQ、JSONB 宽表+多租户隔离——均为业界验证过的选型。

**开发阶段最需解决的 6 个问题**（按紧急度）：
1. 🔴 零测试基础设施
2. 🔴 无 API 文档（Swagger/OpenAPI）
3. 🔴 ESLint 形同虚设 + 无提交钩子
4. 🔴 环境变量无校验
5. 🔴 无 API 版本控制
6. 🔴 无全局错误处理

这 6 项共同特点是：**投入小、收益大、越晚做成本越高**，应在第二阶段功能开发开始前优先完成。
