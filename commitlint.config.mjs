/**
 * Commitlint 配置 — 强制 Conventional Commits 格式。
 *
 * 格式：type(scope): subject
 * 示例：feat(auth): 登录 DTO 迁移
 *       fix(process): 修复流程死锁
 *       docs(knowledge-base): 新增架构分析文档
 */

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // subject 允许中文，不做大小写校验
    'subject-case': [0],
    // type 枚举
    'type-enum': [
      2,
      'always',
      [
        'feat', // 新功能
        'fix', // 修复 bug
        'refactor', // 重构（既非新增功能也非修复）
        'perf', // 性能优化
        'docs', // 文档变更
        'test', // 测试相关
        'chore', // 构建/工具/依赖变更
        'style', // 代码格式（不影响逻辑）
        'ci', // CI 配置变更
        'revert', // 回滚
        'breaking', // 破坏性变更
      ],
    ],
    // scope 枚举（限定为项目实际模块名）
    'scope-enum': [
      2,
      'always',
      [
        'gateway',
        'shared',
        'db',
        'studio',
        'runtime-ui',
        'meta-svc',
        'process-svc',
        'runtime-svc',
        // 业务模块
        'auth',
        'object',
        'record',
        'page',
        'process',
        'permission',
        'tenant',
        'application',
        'notification',
        'queue',
        // 基础设施
        'infra',
        'docs',
        'config',
        'deps',
      ],
    ],
    // scope 非必填（允许 `feat: xxx` 无 scope）
    'scope-empty': [0],
  },
};
