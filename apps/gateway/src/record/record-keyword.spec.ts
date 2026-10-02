/**
 * 关键词搜索 where 纯函数单测（P1 运维治理：对象级搜索配置消费）。
 */

import { describe, expect, it } from 'vitest';
import { buildKeywordWhereFromFields } from './record.service.js';

const FIELDS = [
  { apiName: 'contract_name', type: 'text', searchable: true },
  { apiName: 'contract_code', type: 'auto_number', searchable: true },
  { apiName: 'remark', type: 'long_text', searchable: true },
  { apiName: 'amount', type: 'number', searchable: true }, // 非文本值域，不参与
  { apiName: 'supplier_name', type: 'text', searchable: false }, // 未开启搜索
  { apiName: 'status', type: 'single_select', searchable: true }, // 非文本值域，不参与
];

describe('buildKeywordWhereFromFields', () => {
  it('OR 串 searchable 文本类字段的 string_contains', () => {
    const where = buildKeywordWhereFromFields(FIELDS, '合同A');
    expect(where).toEqual({
      OR: [
        { data: { path: ['contract_name'], string_contains: '合同A' } },
        { data: { path: ['contract_code'], string_contains: '合同A' } },
        { data: { path: ['remark'], string_contains: '合同A' } },
      ],
    });
  });

  it('关键词首尾空白裁剪', () => {
    const where = buildKeywordWhereFromFields(FIELDS, '  PO-0005  ') as {
      OR: Array<{ data: { string_contains: string } }>;
    };
    expect(where.OR[0]!.data.string_contains).toBe('PO-0005');
  });

  it('无 searchable 文本字段 → null（不过滤，不出空结果）', () => {
    const noText = [
      { apiName: 'amount', type: 'number', searchable: true },
      { apiName: 'status', type: 'single_select', searchable: true },
    ];
    expect(buildKeywordWhereFromFields(noText, 'x')).toBeNull();
  });

  it('空白关键词 / undefined → null', () => {
    expect(buildKeywordWhereFromFields(FIELDS, '   ')).toBeNull();
    expect(buildKeywordWhereFromFields(FIELDS, undefined)).toBeNull();
  });

  it('fields 非数组（脏数据）→ null', () => {
    expect(buildKeywordWhereFromFields(null, 'x')).toBeNull();
    expect(buildKeywordWhereFromFields('oops', 'x')).toBeNull();
  });
});
