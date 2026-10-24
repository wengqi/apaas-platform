/**
 * 记录导入导出服务 — CSV 格式的数据导入、导出和模板生成。
 *
 * 导入：csv-parse 解析 → 列头按 apiName 匹配 → 逐行构建 data → 调用 batchCreate
 * 导出：分页查询所有记录 → csv-stringify 生成 CSV → 排除只读字段 + fieldScope 过滤
 * 模板：生成列头 + 示例行的 CSV 供用户下载
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@apaas/db';
import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify/sync';
import { FieldType } from '@apaas/shared';
import type { ImportResult, ImportError } from '@apaas/shared';
import { RecordService } from './record.service.js';
import type { RecordQueryParams } from './record.service.js';
import type { PermissionContext } from '../auth/authenticated-request.js';

/** 导入最大行数（env.validation.ts 定义 IMPORT_MAX_ROWS，默认 5000）。 */
const IMPORT_MAX_ROWS = Number(process.env.IMPORT_MAX_ROWS) || 5000;

/** 导出每页查询行数。 */
const EXPORT_PAGE_SIZE = 100;

/** 只读字段类型（导入时跳过，导出时包含但导入时忽略）。 */
const READONLY_FIELD_TYPES = new Set<string>([
  FieldType.AutoNumber,
  FieldType.Formula,
  FieldType.Rollup,
]);

/** 字段最小结构（从 ObjectMeta.fields JSON 解析）。 */
interface ObjectField {
  id: string;
  apiName: string;
  type: string;
  config: unknown;
}

/**
 * CSV 公式注入中和（P1-13，CWE-1236）：= + - @ 开头（及制表/回车）的单元格
 * 在 Excel/LibreOffice 中会被当公式求值（含 DDE `=cmd|'…'!A0` 形态可执行命令）。
 * 导出统一前缀 `'` 中和；导入按同规则剥离，保证 round-trip 不损坏数据。
 */
const CSV_FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'] as const;

export function neutralizeCsvCell(value: string): string {
  if (value.length > 0 && (CSV_FORMULA_PREFIXES as readonly string[]).includes(value[0]!)) {
    return `'${value}`;
  }
  return value;
}

export function unneutralizeCsvCell(value: string): string {
  if (
    value.length > 1 &&
    value[0] === "'" &&
    (CSV_FORMULA_PREFIXES as readonly string[]).includes(value[1]!)
  ) {
    return value.slice(1);
  }
  return value;
}

@Injectable()
export class RecordImportExportService {
  constructor(private readonly recordService: RecordService) {}

  /**
   * 导出记录为 CSV 字符串。
   *
   * 分页查询所有记录，用字段 apiName 作为列头。
   * 排除只读字段（AutoNumber/Formula/Rollup）。
   * 应用 fieldScope 权限过滤列。
   */
  async exportToCsv(
    tenantId: string,
    objectId: string,
    params: RecordQueryParams,
    permissionContext?: PermissionContext,
  ): Promise<string> {
    const obj = await prisma.objectMeta.findFirst({
      where: { id: objectId, tenantId },
    });
    if (!obj) throw new NotFoundException('对象不存在');

    const fields = this.parseFields(obj.fields);
    const exportableFields = fields.filter((f) => !READONLY_FIELD_TYPES.has(f.type));

    // fieldScope 权限过滤
    const fieldScope = permissionContext?.fieldScope;
    const visibleFields =
      fieldScope && fieldScope.length > 0
        ? exportableFields.filter((f) => fieldScope.includes(f.apiName))
        : exportableFields;

    const headers = visibleFields.map((f) => f.apiName);

    // P1-22（对抗审查 R2-scale-09）：首页 query 拿 total（唯一一次 count），
    // 后续页游标取行（id > cursor，零 count）——旧实现每页重算 count（O(N²/100)）。
    // 行按 id 升序游标推进，分块 stringify 后拼接（降低整表字符串峰值）。
    const chunks: string[] = [];
    let headerEmitted = false;
    let cursorId: string | null = null;

    // 首页（含 total）
    const firstPage = await this.recordService.query(
      tenantId,
      objectId,
      { ...params, page: 1, pageSize: EXPORT_PAGE_SIZE },
      permissionContext,
    );
    const total = firstPage.total;
    let emitted = 0;
    const pushRows = (records: Array<{ id: string; data: Record<string, unknown> }>): void => {
      if (records.length === 0) return;
      const rows: string[][] = headerEmitted ? [] : [headers];
      headerEmitted = true;
      for (const record of records) {
        rows.push(
          headers.map((h) => {
            const val = record.data[h];
            if (val === null || val === undefined) return '';
            if (Array.isArray(val)) return neutralizeCsvCell(val.join(','));
            if (typeof val === 'object') return neutralizeCsvCell(JSON.stringify(val));
            return neutralizeCsvCell(String(val));
          }),
        );
      }
      chunks.push(stringify(rows));
      emitted += records.length;
    };

    pushRows(firstPage.items as Array<{ id: string; data: Record<string, unknown> }>);
    cursorId = firstPage.items.at(-1)?.id ?? null;

    // 游标续页（零 count）
    while (cursorId && emitted < total) {
      const pageRows = await this.recordService.queryCursorPage(
        tenantId,
        objectId,
        cursorId,
        params,
        permissionContext,
        EXPORT_PAGE_SIZE,
      );
      if (pageRows.length === 0) break;
      pushRows(pageRows as Array<{ id: string; data: Record<string, unknown> }>);
      cursorId = pageRows.at(-1)!.id;
    }

    return chunks.join('');
  }

  /**
   * 从 CSV 内容导入记录。
   *
   * 第一行为列头（apiName 匹配），逐行构建 data 对象。
   * 只读字段（AutoNumber/Formula/Rollup）自动跳过。
   * 单行失败不阻断其他行，错误收集到 errors 数组。
   */
  async importFromCsv(
    tenantId: string,
    objectId: string,
    userId: string,
    csvContent: string,
    permissionContext?: PermissionContext,
  ): Promise<ImportResult> {
    const obj = await prisma.objectMeta.findFirst({
      where: { id: objectId, tenantId },
    });
    if (!obj) throw new NotFoundException('对象不存在');

    const fields = this.parseFields(obj.fields);
    const fieldApiNames = new Set(fields.map((f) => f.apiName));

    // 解析 CSV
    const records: Record<string, unknown>[] = [];
    const errors: ImportError[] = [];
    let headerColumns: string[] = [];
    let totalRows = 0;

    const parser = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    let rowIndex = 0;
    for await (const record of parser) {
      rowIndex++;

      // 第一行提取列头
      if (rowIndex === 1) {
        headerColumns = Object.keys(record);
        // 检查列头是否匹配字段
        const unknownColumns = headerColumns.filter((col) => !fieldApiNames.has(col));
        for (const col of unknownColumns) {
          errors.push({ row: 0, field: col, message: `未知字段: ${col}` });
        }
      }

      totalRows++;
      if (totalRows > IMPORT_MAX_ROWS) {
        errors.push({
          row: totalRows,
          message: `超过最大导入行数限制 (${IMPORT_MAX_ROWS})`,
        });
        break;
      }

      // 构建记录数据（跳过只读字段和未知字段）
      // P1-13：导出侧的中和前缀在此剥离，round-trip 不损坏数据
      const data: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record)) {
        if (!fieldApiNames.has(key)) continue;
        const field = fields.find((f) => f.apiName === key);
        if (field && READONLY_FIELD_TYPES.has(field.type)) continue;
        const cell = typeof value === 'string' ? unneutralizeCsvCell(value) : value;
        data[key] = cell === '' ? null : cell;
      }

      records.push(data);
    }

    if (records.length === 0) {
      return { total: totalRows, success: 0, errors };
    }

    // 调用 batchCreate（传递 permissionContext 以执行 fieldScope 列级过滤）
    const batchResult = await this.recordService.batchCreate(
      tenantId,
      objectId,
      userId,
      records,
      permissionContext,
    );

    // 合并错误（列头错误 + 行创建错误）
    const allErrors = [...errors, ...batchResult.errors];

    return {
      total: totalRows,
      success: batchResult.created,
      errors: allErrors,
    };
  }

  /**
   * 生成导入模板 CSV（列头 + 示例行）。
   */
  async getImportTemplate(tenantId: string, objectId: string): Promise<string> {
    const obj = await prisma.objectMeta.findFirst({
      where: { id: objectId, tenantId },
    });
    if (!obj) throw new NotFoundException('对象不存在');

    const fields = this.parseFields(obj.fields);
    const importableFields = fields.filter((f) => !READONLY_FIELD_TYPES.has(f.type));

    const headers = importableFields.map((f) => f.apiName);
    const exampleRow = importableFields.map((f) => this.getExampleValue(f.type));

    return stringify([headers, exampleRow]);
  }

  /**
   * 根据字段类型生成示例值。
   */
  private getExampleValue(fieldType: string): string {
    switch (fieldType) {
      case FieldType.Number:
      case FieldType.Currency:
      case FieldType.Percent:
        return '100';
      case FieldType.Checkbox:
        return 'false';
      case FieldType.Date:
        return '2026-01-01';
      case FieldType.DateTime:
        return '2026-01-01T12:00:00';
      case FieldType.SingleSelect:
      case FieldType.MultiSelect:
        return '选项1';
      case FieldType.User:
        return 'user@example.com';
      default:
        return '示例文本';
    }
  }

  /**
   * 安全解析 ObjectMeta.fields JSON 为字段数组。
   */
  private parseFields(raw: unknown): ObjectField[] {
    if (!Array.isArray(raw)) return [];
    return raw as ObjectField[];
  }
}
