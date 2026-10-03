/**
 * 图标选择器 — emoji 网格选择 + 手输兜底（QA 交互评审 2026-10-03：
 * 此前应用/对象创建仅有自由文本框，用户需凭空想 emoji；业界均为网格选择）。
 *
 * 作为受控 Form 控件使用（value/onChange 由 Form.Item 注入）。
 */

import { useState } from 'react';
import { Button, Input, Popover } from 'antd';
import { SmileOutlined } from '@ant-design/icons';

/** 常用业务图标（按语义分组的一维清单，覆盖应用/对象常见领域）。 */
const ICON_CHOICES = [
  '📦',
  '📋',
  '📄',
  '🧾',
  '🏢',
  '👥',
  '📅',
  '🗓️',
  '📊',
  '📈',
  '💼',
  '🗂️',
  '🏠',
  '🚗',
  '🔧',
  '🛠️',
  '💻',
  '🖥️',
  '📱',
  '📞',
  '📧',
  '💰',
  '💳',
  '🏦',
  '🎁',
  '🔔',
  '📝',
  '✅',
  '⭐',
  '❤️',
  '🔒',
  '🔑',
  '⏰',
  '🌍',
  '🌐',
  '🎯',
  '🚀',
  '🧪',
  '🔬',
  '🏥',
  '🎓',
  '🍽️',
  '🛒',
  '🏷️',
  '🏭',
  '⚡',
  '🌟',
  '📌',
];

interface EmojiIconPickerProps {
  value?: string;
  onChange?: (value: string) => void;
}

export default function EmojiIconPicker({ value, onChange }: EmojiIconPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Input
      value={value}
      maxLength={4}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder="📦"
      suffix={
        <Popover
          open={open}
          onOpenChange={setOpen}
          trigger="click"
          placement="bottomRight"
          content={
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 32px)', gap: 4 }}>
              {ICON_CHOICES.map((icon) => (
                <Button
                  key={icon}
                  type={icon === value ? 'primary' : 'text'}
                  size="small"
                  style={{ fontSize: 18, padding: 0 }}
                  onClick={() => {
                    onChange?.(icon);
                    setOpen(false);
                  }}
                >
                  {icon}
                </Button>
              ))}
            </div>
          }
        >
          <Button type="text" size="small" icon={<SmileOutlined />} title="从图标库选择" />
        </Popover>
      }
    />
  );
}
