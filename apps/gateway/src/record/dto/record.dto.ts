/**
 * 记录 CRUD 请求 DTO — class-based，使 ValidationPipe 和 Swagger 同时生效。
 *
 * 记录数据为动态键值对（键为字段 API 名称），无法静态定义字段，
 * 故使用索引签名。Controller 层覆盖 ValidationPipe
 * 关闭 whitelist/forbidNonWhitelisted，避免动态键被剥离。
 *
 * 注意：TypeScript 不允许在索引签名上使用装饰器，
 * 因此 Swagger 文档通过 @ApiExtraModels + @ApiResponse 在 Controller 层补充。
 */

export class RecordCreateDto {
  [key: string]: unknown;
}

export class RecordUpdateDto {
  [key: string]: unknown;
}
