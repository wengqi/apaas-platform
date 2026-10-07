import { describe, expect, it } from 'vitest';
import { collectFieldBindingIssues, isBindableControlType } from './page-binding.js';

const FIELDS = new Set(['name', 'description', 'quantity', 'status']);

describe('isBindableControlType', () => {
  it('表单控件类型为绑定候选', () => {
    expect(isBindableControlType('input-text')).toBe(true);
    expect(isBindableControlType('select')).toBe(true);
    expect(isBindableControlType('static')).toBe(true);
    expect(isBindableControlType('input-table')).toBe(true);
  });

  it('结构/动作容器与空/非字符串类型不是绑定候选', () => {
    expect(isBindableControlType('grid')).toBe(false);
    expect(isBindableControlType('button')).toBe(false);
    expect(isBindableControlType('dialog')).toBe(false);
    expect(isBindableControlType('')).toBe(false);
    expect(isBindableControlType(undefined)).toBe(false);
    expect(isBindableControlType(123)).toBe(false);
  });
});

describe('collectFieldBindingIssues', () => {
  const form = (controls: unknown[]) => ({
    type: 'page',
    title: '测试页',
    body: [{ type: 'form', title: '表单', body: controls }],
  });

  it('控件 name 全部命中字段 → 无 issue', () => {
    const schema = form([
      { type: 'input-text', name: 'name', label: '名称' },
      { type: 'textarea', name: 'description', label: '描述' },
    ]);
    expect(collectFieldBindingIssues(schema, FIELDS)).toEqual([]);
  });

  it('手输错误字段名 → 列出 issue（含 path/label/type）', () => {
    const schema = form([
      { type: 'input-text', name: 'name', label: '名称' },
      { type: 'input-number', name: 'quantityy', label: '数量' },
    ]);
    const issues = collectFieldBindingIssues(schema, FIELDS);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      name: 'quantityy',
      label: '数量',
      type: 'input-number',
      path: 'body[0].body[1]',
    });
  });

  it('label 缺失时回退 title', () => {
    const schema = form([{ type: 'input-text', name: 'oops', title: '标题回退' }]);
    expect(collectFieldBindingIssues(schema, FIELDS)[0]?.label).toBe('标题回退');
  });

  it('form 之外的节点不参与比对（runtime 取数展示不受影响）', () => {
    const schema = {
      type: 'page',
      body: [
        { type: 'crud', name: 'not_a_field_list' },
        { type: 'static', name: 'not_a_field_disp' },
      ],
    };
    expect(collectFieldBindingIssues(schema, FIELDS)).toEqual([]);
  });

  it('form 内结构容器（grid 自身 name）不比对，其子控件仍比对', () => {
    const schema = form([
      {
        type: 'grid',
        name: 'grid_layout_key',
        columns: [
          { type: 'input-text', name: 'name', label: '名称' },
          { type: 'input-text', name: 'bad_key', label: '错键' },
        ],
      },
    ]);
    const issues = collectFieldBindingIssues(schema, FIELDS);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.name).toBe('bad_key');
  });

  it('form 嵌套在容器中（grid > form）仍被检出', () => {
    const schema = {
      type: 'page',
      body: [
        {
          type: 'grid',
          columns: [{ type: 'form', body: [{ type: 'select', name: 'sttatus' }] }],
        },
      ],
    };
    const issues = collectFieldBindingIssues(schema, FIELDS);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.name).toBe('sttatus');
  });

  it('form 自身 name 与 actions 内按钮 name 不比对', () => {
    const schema = {
      type: 'page',
      body: [
        {
          type: 'form',
          name: 'form_scope_key',
          body: [{ type: 'input-text', name: 'name' }],
          actions: [
            { type: 'button', name: 'submit_btn_key', label: '提交' },
            { type: 'submit', name: 'submit_key' },
          ],
        },
      ],
    };
    expect(collectFieldBindingIssues(schema, FIELDS)).toEqual([]);
  });

  it('dialog 内的 form 同样检出（actions 递归不吞弹层表单）', () => {
    const schema = {
      type: 'page',
      body: [
        {
          type: 'button',
          actionType: 'dialog',
          dialog: {
            type: 'dialog',
            name: 'dialog_key',
            body: [{ type: 'form', body: [{ type: 'input-text', name: 'nope' }] }],
          },
        },
      ],
    };
    const issues = collectFieldBindingIssues(schema, FIELDS);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.name).toBe('nope');
  });

  it('空 name / 非 string name 跳过；命中字段的 name 不报', () => {
    const schema = form([
      { type: 'input-text', label: '无 name' },
      { type: 'input-text', name: '', label: '空 name' },
      { type: 'input-number', name: 42 },
      { type: 'select', name: 'status' },
    ]);
    expect(collectFieldBindingIssues(schema, FIELDS)).toEqual([]);
  });

  it('无 form 的自定义页面 → 无 issue', () => {
    const schema = { type: 'page', body: [{ type: 'chart', name: 'chart_key' }] };
    expect(collectFieldBindingIssues(schema, FIELDS)).toEqual([]);
  });
});
