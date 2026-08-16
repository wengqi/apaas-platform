import tseslint from 'typescript-eslint';
import eslintPluginReact from 'eslint-plugin-react';
import eslintPluginReactHooks from 'eslint-plugin-react-hooks';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  // 全局忽略
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/*.config.{js,ts,mjs,cjs}',
    ],
  },

  // TypeScript 推荐规则
  ...tseslint.configs.recommended,

  // TS/TSX 文件规则
  {
    files: ['**/*.{ts,tsx}'],
    settings: {
      react: { version: 'detect' },
    },
    plugins: {
      react: eslintPluginReact,
      'react-hooks': eslintPluginReactHooks,
    },
    rules: {
      ...eslintPluginReact.configs.recommended.rules,
      ...eslintPluginReactHooks.configs.recommended.rules,
      // 允许 JSX 在 .tsx 中使用（React 17+ JSX 转换无需 import React）
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // 未使用变量：以 _ 开头的参数/变量豁免
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // any 仅警告，不阻断开发
      '@typescript-eslint/no-explicit-any': 'warn',
      // 空对象类型暂降为 warn（存量代码需逐步清理）
      '@typescript-eslint/no-empty-object-type': 'warn',
      // 禁止定时器轮询（编码原则：实时性与事件驱动）
      // 拦截裸 setInterval() 调用
      // setTimeout 用于 debounce/defer 不受此规则限制
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='setInterval']",
          message:
            '禁止使用 setInterval 轮询（编码原则：实时性与事件驱动）。' +
            '必须使用事件驱动架构替代：框架原生事件 API、Pub/Sub、WebSocket、React Query 事件订阅等。' +
            '详见 docs/knowledge-base/CODING-PRINCIPLE-NO-POLLING-2026-08-16.md。' +
            '（setTimeout 用于 debounce/defer 不受此规则限制。）',
        },
        {
          selector: "CallExpression[callee.property.name='setInterval']",
          message:
            '禁止使用 *.setInterval 轮询（编码原则：实时性与事件驱动）。' +
            '必须使用事件驱动架构替代：框架原生事件 API、Pub/Sub、WebSocket、React Query 事件订阅等。' +
            '详见 docs/knowledge-base/CODING-PRINCIPLE-NO-POLLING-2026-08-16.md。' +
            '（setTimeout 用于 debounce/defer 不受此规则限制。）',
        },
      ],
    },
  },

  // Prettier 兼容（关闭与 Prettier 冲突的规则）
  eslintConfigPrettier,
);
