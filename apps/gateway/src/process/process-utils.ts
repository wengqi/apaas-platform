/**
 * 流程引擎 — 变量解析与模版插值工具。
 *
 * 对齐 flowgram.ai 的 IFlowValue 四态值系统（constant / ref / expression / template）。
 * 引擎在节点执行前调用 resolveInputs 将四态绑定值解析为具体值，传入执行器。
 */

import { Parser } from 'expr-eval';
import type { IFlowValue } from '@apaas/shared';

/** 单例 Parser（条件/表达式求值用）。 */
const parser = new Parser();

/**
 * 沿路径数组导航变量对象。
 * ['trigger_0', 'output', 'recordId'] → variables.trigger_0.output.recordId
 */
function resolveRefPath(
  path: string[],
  variables: Record<string, unknown>,
): unknown {
  let current: unknown = variables;
  for (const segment of path) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * 沿点分路径导航变量对象。
 * 'trigger_0.output.orderNo' → variables.trigger_0.output.orderNo
 */
function resolveDottedPath(
  path: string,
  variables: Record<string, unknown>,
): unknown {
  return resolveRefPath(path.split('.'), variables);
}

/**
 * 模版变量插值 —— 支持点分路径。
 * 用于节点内联模版（template 四态值）：
 *   `订单 {{trigger_0.output.orderNo}} 已通过审批`
 */
export function renderTemplateDotted(
  template: string,
  variables: Record<string, unknown>,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, expr: string) => {
    const trimmed = expr.trim();
    const value = resolveDottedPath(trimmed, variables);
    return value !== undefined && value !== null ? String(value) : '';
  });
}

/**
 * 构建表达式求值的扁平作用域。
 *
 * 以全局变量为基础，合并触发器/开始节点的输出字段（扁平化），
 * 使条件表达式能直接用变量名引用（如 `amount > 1000`）。
 */
function buildEvalScope(
  variables: Record<string, unknown>,
): Record<string, unknown> {
  const scope: Record<string, unknown> = {};
  // 全局变量
  const globalVars = variables['global'];
  if (globalVars && typeof globalVars === 'object') {
    Object.assign(scope, globalVars as Record<string, unknown>);
  }
  // 合并各节点输出中顶层为 output 的扁平字段（触发器/开始节点等）
  for (const [key, value] of Object.entries(variables)) {
    if (key === 'global') continue;
    if (value && typeof value === 'object') {
      const nodeOut = (value as Record<string, unknown>)['output'];
      if (nodeOut && typeof nodeOut === 'object') {
        Object.assign(
          scope,
          nodeOut as Record<string, unknown>,
          // 不覆盖已存在的全局变量，避免歧义
        );
        // 反向：全局优先，所以重新覆盖
        const g = globalVars as Record<string, unknown> | undefined;
        if (g) Object.assign(scope, g);
      }
    }
  }
  return scope;
}

/**
 * 求值条件/表达式。
 *
 * 支持：
 *   - 纯表达式：`amount > 1000`、`status == "approved"`
 *   - `{{ }}` 包裹：`{{ amount > 1000 }}`
 *
 * 求值失败或结果非布尔时，返回 false（不阻断流程，保守不进入该分支）。
 */
export function evaluateCondition(
  expression: string,
  variables: Record<string, unknown>,
): boolean {
  if (!expression) return true; // 空条件 = else/default 分支
  // 去除 {{ }} 包裹
  let expr = expression.replace(/\{\{/g, '').replace(/\}\}/g, '').trim();
  if (!expr) return true;
  try {
    const scope = buildEvalScope(variables);
    const result = parser.parse(expr).evaluate(scope as never);
    return Boolean(result);
  } catch {
    // 表达式语法错误或未知变量，保守返回 false
    return false;
  }
}

/**
 * 解析单个 IFlowValue 四态值为具体值。
 *
 * - constant：直接返回 content
 * - ref：沿 content 路径数组导航变量对象
 * - expression：求值表达式（返回原始结果，非布尔）
 * - template：点分路径模版插值
 */
export function resolveFlowValue(
  value: IFlowValue | undefined,
  variables: Record<string, unknown>,
): unknown {
  if (!value || !value.type) return undefined;
  switch (value.type) {
    case 'constant':
      return value.content;
    case 'ref':
      return resolveRefPath(value.content ?? [], variables);
    case 'expression': {
      const expr = value.content ?? '';
      if (!expr) return undefined;
      try {
        const scope = buildEvalScope(variables);
        return parser.parse(expr.replace(/\{\{/g, '').replace(/\}\}/g, '').trim())
          .evaluate(scope as never);
      } catch {
        return undefined;
      }
    }
    case 'template':
      return renderTemplateDotted(value.content ?? '', variables);
    default:
      return undefined;
  }
}

/**
 * 解析节点的全部 inputsValues（四态）为具体值映射。
 */
export function resolveInputs(
  inputsValues: Record<string, IFlowValue> | undefined,
  variables: Record<string, unknown>,
): Record<string, unknown> {
  if (!inputsValues) return {};
  const result: Record<string, unknown> = {};
  for (const [key, fv] of Object.entries(inputsValues)) {
    result[key] = resolveFlowValue(fv, variables);
  }
  return result;
}

/**
 * 将节点输出写入变量作用域（[nodeId].output = output）。
 */
export function writeNodeOutput(
  variables: Record<string, unknown>,
  nodeId: string,
  output: Record<string, unknown> | undefined,
): void {
  if (!output) return;
  variables[nodeId] = { output };
}
