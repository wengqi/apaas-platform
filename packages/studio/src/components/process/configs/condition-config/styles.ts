/**
 * 条件分支配置表单 — RAQB 自定义样式（从 ConditionConfigForm.tsx 拆分，
 * AGENTS.md 单文件 400 行规范）。
 *
 * RAQB + 自定义规则样式 — 飞书 aPaaS 风格。
 */

export const CONDITION_FORM_STYLES = `
  /* === Group 容器 === */
  .group { background: transparent; border: none; border-radius: 0; }
  .group--header {
    padding: 0 0 8px 0;
    border: none;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .group--children { padding: 0 !important; }
  /* 隐藏拖拽手柄（6 点图标）— 本平台不支持拖拽排序 */
  .group--drag-handler, .qb-drag-handler { display: none !important; }

  /* === 连接词按钮（And/Or/Not）=== */
  .group--conjunctions .ant-btn-group {
    display: flex;
    gap: 2px;
  }
  .group--conjunctions .ant-btn {
    font-size: 11px;
    height: 22px;
    line-height: 20px;
    padding: 0 10px;
    border-radius: 11px;
    border: none;
    font-weight: 500;
  }
  .group--conjunctions .ant-btn-primary {
    background: ${T.colorPrimaryBg};
    color: ${T.colorPrimary};
  }
  .group--conjunctions .ant-btn-default {
    background: ${T.colorFillQuaternary};
    color: rgba(0,0,0,0.45);
  }
  .group--conjunctions .ant-btn-default:hover {
    background: ${T.colorBorderSecondary};
    color: rgba(0,0,0,0.65);
  }

  /* === 操作按钮（Add rule/group）=== */
  .group--actions { margin-left: auto; }
  .group--actions .ant-btn-group {
    display: flex;
    gap: 2px;
  }
  .group--actions .ant-btn {
    font-size: 11px;
    height: 22px;
    padding: 0 6px;
    border: none;
    background: transparent;
    box-shadow: none;
    color: rgba(0,0,0,0.45);
    border-radius: 4px;
  }
  .group--actions .ant-btn:hover {
    color: ${T.colorPrimary};
    background: ${T.colorPrimaryBg};
  }
  .group--actions .ant-btn .anticon {
    font-size: 10px;
    margin-right: 2px;
  }

  /* === 嵌套组容器 — 浅色背景卡片区分层级 === */
  .group-or-rule-container.group-container {
    margin-bottom: 6px;
    padding: 6px 8px 4px;
    background: ${T.colorFillQuaternary};
    border-radius: 6px;
  }
  .group-or-rule-container.group-container:last-child {
    margin-bottom: 0;
  }
  /* 嵌套组内的子组用白色背景，与父组的灰色形成对比 */
  .group-or-rule-container.group-container .group-or-rule-container.group-container {
    background: ${T.colorWhite};
    border: 1px solid ${T.colorBorderSecondary};
  }

  /* === 自定义规则行 — 横向四列栅格 === */
  .custom-rule-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  .rule-grid { display: flex; gap: 4px; flex: 1; min-width: 0; }
  .rule-cell { flex: 1; min-width: 0; }
  .rule-cell .ant-select { width: 100% !important; }
  .rule-cell .ant-select-selector {
    border-radius: 4px !important;
    font-size: 12px;
    border-color: ${T.colorBorderSecondary} !important;
  }
  .rule-cell .ant-select-selector:hover {
    border-color: ${T.colorBorder} !important;
  }
  .rule-cell .ant-select-selection-item { font-size: 12px; line-height: 20px; }
  .rule-cell .ant-input {
    width: 100% !important;
    font-size: 12px;
    border-radius: 4px !important;
    border-color: ${T.colorBorderSecondary} !important;
  }
  .rule-cell .ant-input:hover {
    border-color: ${T.colorBorder} !important;
  }
  .rule-cell .ant-input-sm { height: 24px; }
  /* 字段为空时红框高亮 */
  .rule-field-empty .rule-cell:first-child .ant-select-selector {
    border-color: ${T.colorError} !important;
    box-shadow: 0 0 0 2px rgba(255,77,79,0.1);
  }
  .rule-error { color: ${T.colorError}; font-size: 11px; margin-bottom: 4px; }

  /* === 删除按钮 === */
  .rule-delete { flex-shrink: 0; }
  .rule-delete.ant-btn {
    font-size: 12px;
    height: 24px;
    width: 24px;
    min-width: 24px;
    padding: 0;
    border: none;
    background: transparent;
    box-shadow: none;
    border-radius: 4px;
  }
  .rule-delete.ant-btn:hover {
    background: ${T.colorErrorBg};
    color: ${T.colorError};
  }
`;
import { TOKENS as T } from '@apaas/shared/design';
