/**
 * 分组选择器（素蓝首页轮共用）：AutoComplete 承载「选现有组 + 输入新组名」。
 * 分组无独立实体——输入新名字即建组（落到应用上生效）。
 */

import { useMemo } from 'react';
import { AutoComplete } from 'antd';
import { TOKENS as T } from '@apaas/shared/design';

interface GroupSelectProps {
  value?: string;
  onChange?: (value: string) => void;
  /** 现有分组名集合（去空） */
  groupNames: string[];
  placeholder?: string;
  /** 允许自由输入新组名（默认 true） */
  allowCustom?: boolean;
}

export default function GroupSelect({
  value,
  onChange,
  groupNames,
  placeholder = '选择分组，或输入新分组名',
  allowCustom = true,
}: GroupSelectProps) {
  const options = useMemo(
    () =>
      groupNames.map((g) => ({
        value: g,
        label: (
          <span>
            {g}
            <span style={{ float: 'right', color: T.colorTextQuaternary, fontSize: 12 }}>
              现有分组
            </span>
          </span>
        ),
      })),
    [groupNames],
  );

  return (
    <AutoComplete
      value={value}
      options={options}
      onChange={(v) => onChange?.(v ?? '')}
      placeholder={placeholder}
      maxLength={20}
      filterOption={(input, option) =>
        (option?.value as string)?.toLowerCase().includes(input.toLowerCase()) ?? false
      }
      disabled={!allowCustom}
    />
  );
}
