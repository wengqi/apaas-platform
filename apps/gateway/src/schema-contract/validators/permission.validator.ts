/**
 * 权限规则集校验器（G3 第五类，AI 主线第四轮）。
 *
 * 校验以角色为单元的规则集快照：五维权限类型/动作枚举、目标、行级条件
 * （JsonLogic 对象）、字段范围、效果枚举。targetId 的存在性由 MCP 层
 * 对照活表校验（同 workflow pageId 白名单模式），此处只做结构合同。
 */

import type { SchemaIssue } from '@apaas/shared';
import { SCHEMA_ISSUE_CODES } from '@apaas/shared';

/** 五级权限维度（PermissionRule.type）。 */
const RULE_TYPES: ReadonlySet<string> = new Set([
  'PAGE',
  'RECORD',
  'PROCESS',
  'DATA_MODEL',
  'CONNECTOR',
]);

/** 动作枚举（PermissionRule.action）。 */
const RULE_ACTIONS: ReadonlySet<string> = new Set([
  'VIEW',
  'CREATE',
  'EDIT',
  'DELETE',
  'EXECUTE',
  'APPROVE',
  'MANAGE',
]);

const RULE_EFFECTS: ReadonlySet<string> = new Set(['ALLOW', 'DENY']);

const MAX_RULES = 200;

/** 校验权限规则集草稿（apiName=角色code/name/rules）。 */
export function validatePermission(draft: unknown): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  if (typeof draft !== 'object' || draft === null || Array.isArray(draft)) {
    issues.push({
      path: '',
      code: SCHEMA_ISSUE_CODES.ROOT_INVALID,
      message: '权限规则集草稿必须是对象',
      severity: 'error',
    });
    return issues;
  }
  const d = draft as Record<string, unknown>;

  if (typeof d['apiName'] !== 'string' || d['apiName'].length === 0) {
    issues.push({
      path: 'apiName',
      code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
      message: '缺少角色编码 apiName（作为治理单元标识）',
      severity: 'error',
    });
  }
  if (typeof d['name'] !== 'string' || d['name'].length === 0) {
    issues.push({
      path: 'name',
      code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
      message: '缺少角色显示名 name',
      severity: 'error',
    });
  }

  const rules = d['rules'];
  if (!Array.isArray(rules)) {
    issues.push({
      path: 'rules',
      code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
      message: '缺少规则集 rules 数组（批准时全量替换该角色现有规则；清空传 []）',
      severity: 'error',
    });
    return issues;
  }
  if (rules.length > MAX_RULES) {
    issues.push({
      path: 'rules',
      code: SCHEMA_ISSUE_CODES.STRUCTURE_LIMIT,
      message: `规则数超过上限 ${MAX_RULES}`,
      severity: 'error',
    });
  }

  for (const [idx, r] of rules.entries()) {
    const p = `rules/${idx}`;
    if (typeof r !== 'object' || r === null || Array.isArray(r)) {
      issues.push({
        path: p,
        code: SCHEMA_ISSUE_CODES.ROOT_INVALID,
        message: '规则必须是对象 {type, action, targetId, condition?, fieldScope?, effect?}',
        severity: 'error',
      });
      continue;
    }
    const rule = r as Record<string, unknown>;

    const type = rule['type'];
    if (typeof type !== 'string' || !RULE_TYPES.has(type)) {
      issues.push({
        path: `${p}/type`,
        code: SCHEMA_ISSUE_CODES.INVALID_VALUE,
        message: `权限维度 "${String(type)}" 非法：仅支持 PAGE/RECORD/PROCESS/DATA_MODEL/CONNECTOR`,
        severity: 'error',
      });
    }

    const action = rule['action'];
    if (typeof action !== 'string' || !RULE_ACTIONS.has(action)) {
      issues.push({
        path: `${p}/action`,
        code: SCHEMA_ISSUE_CODES.INVALID_VALUE,
        message: `权限动作 "${String(action)}" 非法：仅支持 VIEW/CREATE/EDIT/DELETE/EXECUTE/APPROVE/MANAGE`,
        severity: 'error',
      });
    }

    const targetId = rule['targetId'];
    if (typeof targetId !== 'string' || targetId.length === 0) {
      issues.push({
        path: `${p}/targetId`,
        code: SCHEMA_ISSUE_CODES.MISSING_REQUIRED,
        message:
          '缺少作用目标 targetId（PAGE=页面ID / RECORD|DATA_MODEL=对象ID / PROCESS=流程定义ID / CONNECTOR=连接器ID；用 list_* 工具获取）',
        severity: 'error',
      });
    }

    const condition = rule['condition'];
    if (condition !== undefined && condition !== null) {
      if (typeof condition !== 'object' || Array.isArray(condition)) {
        issues.push({
          path: `${p}/condition`,
          code: SCHEMA_ISSUE_CODES.INVALID_VALUE,
          message:
            'condition 必须是 JsonLogic JSON 对象（如 {"==":[{"var":"status"},"approved"]}）或 null',
          severity: 'error',
        });
      }
    }

    const fieldScope = rule['fieldScope'];
    if (fieldScope !== undefined && fieldScope !== null) {
      if (
        !Array.isArray(fieldScope) ||
        !fieldScope.every((f) => typeof f === 'string' && f.length > 0)
      ) {
        issues.push({
          path: `${p}/fieldScope`,
          code: SCHEMA_ISSUE_CODES.INVALID_VALUE,
          message: 'fieldScope 必须是非空字符串数组（字段白名单）或 null（全部字段）',
          severity: 'error',
        });
      }
    }

    const effect = rule['effect'];
    if (effect !== undefined && effect !== null) {
      if (typeof effect !== 'string' || !RULE_EFFECTS.has(effect)) {
        issues.push({
          path: `${p}/effect`,
          code: SCHEMA_ISSUE_CODES.INVALID_VALUE,
          message: `effect "${String(effect)}" 非法：仅支持 ALLOW / DENY`,
          severity: 'error',
        });
      }
    }
  }

  return issues;
}
