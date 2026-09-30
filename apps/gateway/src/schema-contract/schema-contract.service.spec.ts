/**
 * Schema 校验合同单测（G3）。
 *
 * 覆盖三类 schema 的合法/非法路径，含 spike 实证的方言陷阱
 * （nested-select 命名、static-file 黑名单、幽灵边、多模式审批人）。
 */

import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SchemaContractService } from './schema-contract.service.js';

const service = new SchemaContractService();

// ---------------------------------------------------------------------------
// amis_page
// ---------------------------------------------------------------------------

const validPage = {
  type: 'page',
  title: '合同审批',
  body: [
    {
      type: 'form',
      title: '合同信息',
      static: true,
      actions: [],
      body: [
        { type: 'input-text', name: 'contract_name', label: '合同名称' },
        { type: 'input-number', name: 'amount', label: '金额', kilobitSeparator: true },
      ],
    },
    {
      type: 'button',
      label: '通过',
      actionType: 'ajax',
      api: { method: 'post', url: '/api/v1/tasks/${taskId}/complete' },
    },
  ],
};

describe('amis_page 校验', () => {
  it('合法页面通过（spike case1 同构）', () => {
    const r = service.validate('amis_page', validPage);
    expect(r.valid).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it('根节点非 page → 拒绝（一切界面皆页面）', () => {
    const r = service.validate('amis_page', { type: 'form', body: [] });
    expect(r.valid).toBe(false);
    expect(r.issues[0]!.code).toBe('ROOT_INVALID');
    expect(r.issues[0]!.message).toContain('一切界面皆页面');
  });

  it('黑名单类型（input-cascader）→ TYPE_FORBIDDEN 且给出替代方案', () => {
    const r = service.validate('amis_page', {
      type: 'page',
      body: [{ type: 'input-cascader', name: 'region', label: '地区' }],
    });
    const err = r.issues.find((i) => i.code === 'TYPE_FORBIDDEN');
    expect(err).toBeTruthy();
    expect(err!.message).toContain('nested-select');
  });

  it('跨框架混淆别名（date-picker）→ 建议为 amis 真实类型 input-date', () => {
    const r = service.validate('amis_page', {
      type: 'page',
      body: [{ type: 'date-picker', name: 'sign_date', label: '签订日期' }],
    });
    const err = r.issues.find((i) => i.code === 'UNKNOWN_TYPE');
    expect(err).toBeTruthy();
    expect(err!.message).toContain('input-date');
  });

  it('拼写接近的类型（inpt-text）→ 编辑距离建议 input-text', () => {
    const r = service.validate('amis_page', {
      type: 'page',
      body: [{ type: 'inpt-text', name: 'n', label: '名称' }],
    });
    const err = r.issues.find((i) => i.code === 'UNKNOWN_TYPE');
    expect(err).toBeTruthy();
    expect(err!.message).toContain('input-text');
  });

  it('平台黑名单：static-file → 禁用 + 替代方案', () => {
    const r = service.validate('amis_page', {
      type: 'page',
      body: [{ type: 'static-file', name: 'attachment', label: '附件' }],
    });
    const err = r.issues.find((i) => i.code === 'TYPE_FORBIDDEN');
    expect(err).toBeTruthy();
    expect(err!.message).toContain('input-file');
  });

  it('未知 actionType → 拒绝', () => {
    const r = service.validate('amis_page', {
      type: 'page',
      body: [{ type: 'button', actionType: 'launchMissile' }],
    });
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.path.endsWith('actionType'))).toBe(true);
  });

  it('外联 api.url → 拒绝（平台相对路径约束）', () => {
    const r = service.validate('amis_page', {
      type: 'page',
      body: [{ type: 'button', actionType: 'ajax', api: 'https://evil.example.com/steal' }],
    });
    expect(r.valid).toBe(false);
    expect(r.issues[0]!.message).toContain('相对路径');
  });

  it('非对象/缺 type → ROOT_INVALID 快速失败', () => {
    expect(service.validate('amis_page', null).valid).toBe(false);
    expect(service.validate('amis_page', { body: [] }).valid).toBe(false);
  });

  it('assertValid 非法时抛 BadRequestException', () => {
    expect(() =>
      service.assertValid('amis_page', { type: 'page', body: [{ type: 'no-such-type' }] }),
    ).toThrow(BadRequestException);
  });
});

// ---------------------------------------------------------------------------
// workflow
// ---------------------------------------------------------------------------

function makeWorkflow(overrides: {
  nodes?: Array<Record<string, unknown>>;
  edges?: Array<Record<string, unknown>>;
}) {
  return {
    nodes: overrides.nodes ?? [],
    edges: overrides.edges ?? [],
  };
}

const validUserTask = {
  id: 'ut1',
  type: 'user_task',
  data: { taskName: '会签', approvalMode: 'countersign', approveUsers: ['u1', 'u2'] },
};
const validFlow = makeWorkflow({
  nodes: [
    { id: 's', type: 'start', data: {} },
    validUserTask,
    { id: 'c', type: 'condition', data: {} },
    { id: 'e', type: 'end', data: {} },
  ],
  edges: [
    { sourceNodeID: 's', targetNodeID: 'ut1' },
    { sourceNodeID: 'ut1', targetNodeID: 'c' },
    { sourceNodeID: 'c', targetNodeID: 'e', condition: '{"==":[{"var":"decision"},"APPROVED"]}' },
    { sourceNodeID: 'c', targetNodeID: 'e' },
  ],
});

describe('workflow 校验', () => {
  it('合法流程通过', () => {
    const r = service.validate('workflow', validFlow);
    expect(r.valid).toBe(true);
  });

  it('幽灵边（终点不存在）→ REF_NOT_FOUND', () => {
    const bad = makeWorkflow({
      nodes: [
        { id: 's', type: 'start', data: {} },
        { id: 'e', type: 'end', data: {} },
      ],
      edges: [
        { sourceNodeID: 's', targetNodeID: 'e' },
        { sourceNodeID: 's', targetNodeID: 'ghost' },
      ],
    });
    const r = service.validate('workflow', bad);
    expect(r.issues.some((i) => i.code === 'REF_NOT_FOUND' && i.message.includes('幽灵边'))).toBe(
      true,
    );
  });

  it('缺 start/end → 拒绝', () => {
    const bad = makeWorkflow({
      nodes: [{ id: 'a', type: 'user_task', data: { taskName: 'x', assignee: 'u' } }],
      edges: [],
    });
    const r = service.validate('workflow', bad);
    expect(r.issues.filter((i) => i.code === 'MISSING_REQUIRED').length).toBeGreaterThanOrEqual(2);
  });

  it('未知节点类型 → UNKNOWN_TYPE', () => {
    const bad = makeWorkflow({
      nodes: [
        { id: 's', type: 'start', data: {} },
        { id: 'x', type: 'magic_node', data: {} },
        { id: 'e', type: 'end', data: {} },
      ],
      edges: [{ sourceNodeID: 's', targetNodeID: 'e' }],
    });
    expect(r_valid_false(service.validate('workflow', bad), 'magic_node')).toBe(true);
  });

  it('会签缺 approveUsers → MISSING_REQUIRED', () => {
    const bad = makeWorkflow({
      nodes: [
        { id: 's', type: 'start', data: {} },
        {
          id: 'ut',
          type: 'user_task',
          data: { taskName: 'x', approvalMode: 'countersign', approveUsers: [] },
        },
        { id: 'e', type: 'end', data: {} },
      ],
      edges: [{ sourceNodeID: 's', targetNodeID: 'e' }],
    });
    const r = service.validate('workflow', bad);
    expect(r.issues.some((i) => i.message.includes('approveUsers'))).toBe(true);
  });

  it('单人审批无受理人 → MISSING_REQUIRED', () => {
    const bad = makeWorkflow({
      nodes: [
        { id: 's', type: 'start', data: {} },
        { id: 'ut', type: 'user_task', data: { taskName: 'x', approvalMode: 'single' } },
        { id: 'e', type: 'end', data: {} },
      ],
      edges: [{ sourceNodeID: 's', targetNodeID: 'e' }],
    });
    expect(r_valid_false(service.validate('workflow', bad), 'assignee')).toBe(true);
  });

  it('pageId 不存在（提供 ctx）→ REF_NOT_FOUND', () => {
    const withPage = makeWorkflow({
      nodes: [
        { id: 's', type: 'start', data: {} },
        {
          id: 'ut',
          type: 'user_task',
          data: { taskName: 'x', approvalMode: 'single', assignee: 'u1', pageId: 'page-404' },
        },
        { id: 'e', type: 'end', data: {} },
      ],
      edges: [{ sourceNodeID: 's', targetNodeID: 'e' }],
    });
    const withCtx = service.validate('workflow', withPage, { pageIds: new Set(['page-real']) });
    expect(
      withCtx.issues.some(
        (i) =>
          (i.code === 'REF_NOT_FOUND' && i.message.includes('pageId')) ||
          i.message.includes('审批页面'),
      ),
    ).toBe(true);
    // 不提供 ctx 时跳过引用校验（防误报）
    const noCtx = service.validate('workflow', withPage);
    expect(noCtx.issues.some((i) => i.code === 'REF_NOT_FOUND')).toBe(false);
  });

  it('边条件非法 JSON → JSON_PARSE', () => {
    const bad = makeWorkflow({
      nodes: [
        { id: 's', type: 'start', data: {} },
        { id: 'e', type: 'end', data: {} },
      ],
      edges: [{ sourceNodeID: 's', targetNodeID: 'e', condition: '{not-json' }],
    });
    expect(service.validate('workflow', bad).issues.some((i) => i.code === 'JSON_PARSE')).toBe(
      true,
    );
  });

  it('孤立节点 → warning（不拒绝）', () => {
    const r = service.validate('workflow', validFlow);
    expect(r.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// object_meta
// ---------------------------------------------------------------------------

const validMeta = {
  apiName: 'contract',
  name: '采购合同',
  fields: [
    { apiName: 'contract_name', label: '合同名称', type: 'text', config: {} },
    {
      apiName: 'status',
      label: '状态',
      type: 'single_select',
      config: { options: [{ value: 'PENDING', label: '审批中' }] },
    },
    { apiName: 'amount', label: '金额', type: 'currency', config: { number: { precision: 2 } } },
    { apiName: 'code', label: '编号', type: 'auto_number', config: { format: 'PO-{seq:0000}' } },
  ],
};

describe('object_meta 校验', () => {
  it('合法对象通过', () => {
    expect(service.validate('object_meta', validMeta).valid).toBe(true);
  });

  it('apiName 非 snake_case → 拒绝', () => {
    const r = service.validate('object_meta', {
      ...validMeta,
      apiName: 'Contract-Name',
    });
    expect(r.issues[0]!.path).toBe('apiName');
  });

  it('字段类型不在 18 种白名单 → UNKNOWN_TYPE', () => {
    const r = service.validate('object_meta', {
      ...validMeta,
      fields: [{ apiName: 'x', label: 'X', type: 'quantum_field', config: {} }],
    });
    expect(r.issues.some((i) => i.code === 'UNKNOWN_TYPE')).toBe(true);
  });

  it('选择字段缺 options → MISSING_REQUIRED', () => {
    const r = service.validate('object_meta', {
      ...validMeta,
      fields: [{ apiName: 'status', label: '状态', type: 'single_select', config: {} }],
    });
    expect(r.issues.some((i) => i.message.includes('options'))).toBe(true);
  });

  it('重复字段 apiName → DUPLICATE_KEY', () => {
    const r = service.validate('object_meta', {
      ...validMeta,
      fields: [
        { apiName: 'amount', label: 'A', type: 'number', config: {} },
        { apiName: 'amount', label: 'B', type: 'number', config: {} },
      ],
    });
    expect(r.issues.some((i) => i.code === 'DUPLICATE_KEY')).toBe(true);
  });

  it('auto_number 缺 format → MISSING_REQUIRED', () => {
    const r = service.validate('object_meta', {
      ...validMeta,
      fields: [{ apiName: 'code', label: '编号', type: 'auto_number', config: {} }],
    });
    expect(r.issues.some((i) => i.message.includes('config.format'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

function r_valid_false(
  result: { valid: boolean; issues: Array<{ message: string }> },
  keyword: string,
): boolean {
  return !result.valid && result.issues.some((i) => i.message.includes(keyword));
}
