/**
 * 字段配置 — 选项管理器（单选 / 多选，从 FieldConfigDrawer.tsx 抽出）。
 *
 * 支持颜色、选项名称、存储值（value，可空回退 label）、默认项与排序增删。
 */

import { TOKENS as T, PRESET as P } from '@apaas/shared/design';
import { Button, Checkbox, ColorPicker, Form, Input, Tooltip } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { SelectOption } from '../../../api/objects.js';
import { genId } from './utils.js';

const PRESET_COLORS = [
  T.colorPrimary,
  T.colorSuccess,
  T.colorWarning,
  T.colorError,
  `${P.purple6}`,
  `${P.cyan6}`,
  `${P.magenta6}`,
  T.colorGold,
];

export default function OptionManager({
  options,
  setOptions,
  multiple,
}: {
  options: SelectOption[];
  setOptions: React.Dispatch<React.SetStateAction<SelectOption[]>>;
  multiple: boolean;
}) {
  /** 更新单个选项。 */
  const updateOption = (id: string, patch: Partial<SelectOption>) => {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  };

  /** 删除选项。 */
  const removeOption = (id: string) => {
    setOptions((prev) => prev.filter((o) => o.id !== id));
  };

  /** 添加选项。 */
  const addOption = () => {
    setOptions((prev) => [
      ...prev,
      {
        id: genId(),
        label: '',
        color: PRESET_COLORS[prev.length % PRESET_COLORS.length],
        isDefault: false,
      },
    ]);
  };

  /** 设置默认(单选互斥)。 */
  const setDefault = (id: string, checked: boolean) => {
    if (multiple) {
      updateOption(id, { isDefault: checked });
    } else {
      // 单选:仅一项可为默认
      setOptions((prev) =>
        prev.map((o) => (o.id === id ? { ...o, isDefault: checked } : { ...o, isDefault: false })),
      );
    }
  };

  return (
    <Form.Item label="选项配置">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {options.map((opt) => (
          <div
            key={opt.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              background: T.colorFillQuaternary,
              borderRadius: 8,
            }}
          >
            {/* 颜色选择 */}
            <ColorPicker
              size="small"
              value={opt.color ?? PRESET_COLORS[0]}
              onChange={(color) => updateOption(opt.id, { color: color.toHexString() })}
              presets={[{ label: '预设', colors: PRESET_COLORS }]}
            />
            {/* 标签 */}
            <Input
              value={opt.label}
              onChange={(e) => updateOption(opt.id, { label: e.target.value })}
              placeholder="选项名称"
              size="small"
              style={{ flex: 1 }}
            />
            {/* 评审整改：存储值（留空则用选项名称）——供流程条件/集成使用稳定编码 */}
            <Input
              value={opt.value ?? ''}
              onChange={(e) => updateOption(opt.id, { value: e.target.value || undefined })}
              placeholder="存储值(可选)"
              size="small"
              style={{ width: 120, fontFamily: 'monospace' }}
            />
            {/* 默认 */}
            <Tooltip title={multiple ? '设为默认' : '设为默认(单选互斥)'}>
              <Checkbox
                checked={!!opt.isDefault}
                onChange={(e) => setDefault(opt.id, e.target.checked)}
              >
                <span style={{ fontSize: 12 }}>默认</span>
              </Checkbox>
            </Tooltip>
            {/* 删除 */}
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => removeOption(opt.id)}
            />
          </div>
        ))}
        <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addOption} block>
          添加选项
        </Button>
      </div>
    </Form.Item>
  );
}
