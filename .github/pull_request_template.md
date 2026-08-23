## 变更说明

<!-- 简要描述本次变更的内容和目的 -->

## 变更类型

- [ ] `feat` — 新功能
- [ ] `fix` — 修复 bug
- [ ] `refactor` — 重构（非新功能、非修复）
- [ ] `perf` — 性能优化
- [ ] `docs` — 文档变更
- [ ] `test` — 测试相关
- [ ] `chore` — 构建/工具/依赖变更
- [ ] `ci` — CI 配置变更
- [ ] `breaking` — 破坏性变更

## 检查清单

- [ ] `pnpm lint` 通过（0 errors, 0 warnings）
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过
- [ ] `pnpm build` 通过
- [ ] 新增核心逻辑附带单元测试
- [ ] 新增 API 接口标注 `@ApiTags` + `@ApiBearerAuth`
- [ ] 新增环境变量已加入 `env.validation.ts` + `.env.example`
- [ ] `bash scripts/check-doc-sync.sh` 通过（文档同步检查）

## 文档同步检查（feat/fix 类型 PR 必填）

- [ ] `ROADMAP.md` 中对应 Phase 状态已更新
- [ ] `STATUS-MATRIX` 中对应模块进度已更新
- [ ] `AGENTS.md` "当前阶段"部分已同步
- [ ] 新增模块已同步至 `commitlint.config.mjs` scope-enum 和 `AGENTS.md` scope 列表

## 飞书 aPaaS 对齐标注

<!-- 若涉及功能开发，标注与飞书 aPaaS 的对齐情况 -->

- [ ] 对齐
- [ ] 增强
- [ ] 简化
- [ ] 偏离（请在下方说明理由）

## 关联 Issue

<!-- 如有关联 issue，填写 #issue-number -->
