/**
 * 控件族 ↔ 对象字段类型兼容矩阵（SSOT 镜像，2026-10-07 类型兼容专项）。
 *
 * 唯一事实来源 = `page-template.ts` 的 fieldToFormControl 生成映射（平台官方
 * 「字段→控件」口径）。本模块是其反演：控件 am Is 类型 → 兼容字段类型集。
 * 三方消费共享此矩阵：
 * - ApaasFormPlugin 字段选择器：兼容组在前，不兼容字段折叠为「类型不兼容」组；
 * - page-binding 保存校验：区分「未匹配字段」与「类型不兼容」两类告警（均非阻断）；
 * - 镜像一致性单测：对生成映射逐类型断言反演兼容，防两处漂移。
 *
 * 判定口径：不在矩阵中的控件类型 = 无既定映射（unknown）→ 不过滤不告警
 * （避免对 amis 全量物料产生误报）；生成映射 default 落 input-text 的类型
 * （text/rich_text/user/lookup/sub_form/formula/rollup）按官方口径兼容 input-text。
 */

/** 生成映射的反演：amis 控件类型 → 兼容字段类型集。 */
export const CONTROL_FIELD_COMPAT: Readonly<Record<string, readonly string[]>> = {
  'input-text': ['text', 'rich_text', 'user', 'lookup', 'sub_form', 'formula', 'rollup'],
  textarea: ['long_text'],
  'input-number': ['number', 'percent', 'currency'],
  'input-date': ['date'],
  'input-datetime': ['date_time'],
  // 只读计算字段（引擎计算，提交值以系统为准）→ static 只读控件
  static: ['auto_number', 'formula', 'rollup', 'sub_form'],
  switch: ['checkbox'],
  'input-file': ['attachment'],
  // select 按 multiple 细分（见 isControlFieldCompatible）
  select: ['single_select', 'multi_select'],
};

export type CompatVerdict = 'compatible' | 'incompatible' | 'unknown';

/**
 * 判定控件与字段类型兼容性。
 * @param controlType amis 控件 type（如 input-number）
 * @param controlMultiple 控件是否多选形态（select 的 multiple 标记）
 * @param fieldType 对象字段类型（shared FieldType 字符串值）
 */
export function isControlFieldCompatible(
  controlType: unknown,
  controlMultiple: boolean,
  fieldType: unknown,
): CompatVerdict {
  if (typeof controlType !== 'string' || typeof fieldType !== 'string') return 'unknown';
  const compat = CONTROL_FIELD_COMPAT[controlType];
  if (!compat) return 'unknown';
  if (controlType === 'select') {
    // 官方生成口径：single_select→select、multi_select→select+multiple，互斥
    return compat.includes(fieldType) &&
      (controlMultiple ? fieldType === 'multi_select' : fieldType === 'single_select')
      ? 'compatible'
      : 'incompatible';
  }
  return compat.includes(fieldType) ? 'compatible' : 'incompatible';
}

/** 按兼容性把字段列表分为两组（unknown 控件全量入兼容组=不过滤）。 */
export function partitionFieldsByCompat(
  controlType: unknown,
  controlMultiple: boolean,
  fields: ReadonlyArray<{ apiName: string; label: string; type: string }>,
): { compatible: typeof fields; incompatible: typeof fields } {
  const compatible: Array<{ apiName: string; label: string; type: string }> = [];
  const incompatible: Array<{ apiName: string; label: string; type: string }> = [];
  for (const f of fields) {
    (isControlFieldCompatible(controlType, controlMultiple, f.type) === 'incompatible'
      ? incompatible
      : compatible
    ).push(f);
  }
  return { compatible, incompatible };
}
