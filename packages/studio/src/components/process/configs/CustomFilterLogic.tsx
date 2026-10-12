/**
 * 自定义筛选条件逻辑组件 — 飞书 aPaaS 风格。
 *
 * 当分支内有多条运算符条件时，用户可以：
 * - 关闭（默认）：所有条件以 AND 关系计算（满足全部）
 * - 开启：自定义逻辑表达式，如 "1 and (2 or 3)"，引用条件序号
 *
 * 交互：
 *   [Switch] 自定义筛选条件逻辑
 *   关闭时描述：否，不自定义筛选条件逻辑关系，计算结果需要满足所有筛选条件。
 *   开启时描述：是，筛选条件逻辑关系自定义开启，所有的筛选条件会以自定义的逻辑关系计算。
 *   开启时显示文本框：placeholder="输入筛选条件逻辑关系，例如「1 and (2 or 3)」"
 */

import { TOKENS as T } from '@apaas/shared/design';
import { useState, useEffect } from 'react';
import { Input, Switch, Typography } from 'antd';
import { validateCustomLogic, generateDefaultLogic } from './custom-logic-parser.js';

const { Text } = Typography;

export interface CustomFilterLogicData {
  enabled: boolean;
  expression: string;
}

export interface CustomFilterLogicProps {
  /** 当前自定义逻辑配置 */
  data: CustomFilterLogicData | undefined;
  /** 条件数量（用于序号校验和默认表达式生成） */
  conditionCount: number;
  /** 配置变化回调 */
  onChange: (data: CustomFilterLogicData) => void;
}

export default function CustomFilterLogic({
  data,
  conditionCount,
  onChange,
}: CustomFilterLogicProps) {
  const enabled = data?.enabled ?? false;
  const expression = data?.expression ?? '';
  const [localExpr, setLocalExpr] = useState(expression);

  // 同步外部更新
  useEffect(() => {
    setLocalExpr(expression);
  }, [expression]);

  const handleToggle = (checked: boolean): void => {
    if (checked) {
      // 开启时自动生成默认表达式
      const defaultExpr = generateDefaultLogic(conditionCount);
      setLocalExpr(defaultExpr);
      onChange({ enabled: true, expression: defaultExpr });
    } else {
      onChange({ enabled: false, expression: localExpr });
    }
  };

  const handleExpressionChange = (value: string): void => {
    setLocalExpr(value);
    onChange({ enabled: true, expression: value });
  };

  // 校验表达式
  const validation = enabled ? validateCustomLogic(localExpr, conditionCount) : { valid: true };

  return (
    <div
      style={{
        marginTop: 8,
        padding: '8px 10px',
        background: T.colorFillQuaternary,
        borderRadius: 6,
        border: `1px solid ${T.colorBorderSecondary}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Switch size="small" checked={enabled} onChange={handleToggle} />
        <Text style={{ fontSize: 12, fontWeight: 500 }}>自定义筛选条件逻辑</Text>
      </div>
      {!enabled ? (
        <Text type="secondary" style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)' }}>
          否，不自定义筛选条件逻辑关系，计算结果需要满足所有筛选条件。
        </Text>
      ) : (
        <>
          <Text
            type="secondary"
            style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', display: 'block', marginBottom: 6 }}
          >
            是，筛选条件逻辑关系自定义开启，所有的筛选条件会以自定义的逻辑关系计算。
          </Text>
          <Input
            size="small"
            placeholder="输入筛选条件逻辑关系，例如「1 and (2 or 3)」"
            value={localExpr}
            onChange={(e) => handleExpressionChange(e.target.value)}
            status={validation.valid ? undefined : 'error'}
            style={{ fontSize: 12 }}
          />
          {!validation.valid && (
            <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
              {validation.error}
            </Text>
          )}
        </>
      )}
    </div>
  );
}
