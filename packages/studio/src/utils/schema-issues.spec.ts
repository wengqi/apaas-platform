/**
 * 底部调试面板单元测试 — Schema 静态检查 + 日志过滤。
 */

import { describe, expect, it } from 'vitest';
import { collectSchemaIssues } from './schema-issues.js';
import { filterLogs, type ConsoleLogEntry } from '../stores/page-builder/debug.js';
import type { ComponentNode, PageSchema } from '../api/pages.js';

function node(partial: Partial<ComponentNode> & Pick<ComponentNode, 'id' | 'type'>): ComponentNode {
  return { props: {}, ...partial } as ComponentNode;
}

function schemaOf(root: ComponentNode): PageSchema {
  return { version: '1', pageType: 'custom', viewModel: { variables: {} }, root };
}

describe('错误检查 — collectSchemaIssues', () => {
  it('空 schema 返回空清单', () => {
    expect(collectSchemaIssues(null)).toEqual([]);
  });

  it('字段缺少标题报 error', () => {
    const issues = collectSchemaIssues(schemaOf(node({ id: 'f1', type: 'text_input', props: {} })));
    expect(issues.some((i) => i.severity === 'error' && i.message.includes('缺少标题'))).toBe(true);
  });

  it('表单未关联对象报警告', () => {
    const issues = collectSchemaIssues(schemaOf(node({ id: 'form1', type: 'form', props: {} })));
    expect(issues.some((i) => i.severity === 'warn' && i.message.includes('未关联对象'))).toBe(
      true,
    );
  });

  it('按钮未配置点击动作报警告', () => {
    const issues = collectSchemaIssues(schemaOf(node({ id: 'b1', type: 'button', props: {} })));
    expect(issues.some((i) => i.severity === 'warn' && i.message.includes('未配置点击动作'))).toBe(
      true,
    );
  });

  it('绑定到不存在的 vm 变量报 error，变量存在则不报', () => {
    const bad = schemaOf(
      node({ id: 't1', type: 'text', props: { content: { __bind: 'vm.missing.name' } } }),
    );
    expect(collectSchemaIssues(bad).some((i) => i.message.includes('vm.missing'))).toBe(true);

    const ok: PageSchema = {
      ...schemaOf(
        node({ id: 't2', type: 'text', props: { content: { __bind: 'vm.record.name' } } }),
      ),
      viewModel: { variables: { record: { type: 'record' } } },
    };
    expect(collectSchemaIssues(ok)).toHaveLength(0);
  });

  it('数据表格未绑定数据源报警告', () => {
    const issues = collectSchemaIssues(
      schemaOf(node({ id: 'dt1', type: 'data_table', props: {} })),
    );
    expect(issues.some((i) => i.message.includes('未绑定数据源'))).toBe(true);
  });

  it('error 排在 warn 之前', () => {
    const issues = collectSchemaIssues(
      schemaOf(
        node({
          id: 'form2',
          type: 'form',
          props: {},
          children: [node({ id: 'f2', type: 'text_input', props: {} })],
        }),
      ),
    );
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues[0]?.severity).toBe('error');
  });
});

describe('控制台 — filterLogs', () => {
  const logs: ConsoleLogEntry[] = [
    { id: 1, level: 'error', time: 1, message: 'a' },
    { id: 2, level: 'info', time: 2, message: 'b' },
    { id: 3, level: 'success', time: 3, message: 'c' },
  ];

  it('空集合返回全部', () => {
    expect(filterLogs(logs, new Set())).toHaveLength(3);
  });

  it('按级别过滤', () => {
    const result = filterLogs(logs, new Set(['error']));
    expect(result).toHaveLength(1);
    expect(result[0]?.message).toBe('a');
  });
});
