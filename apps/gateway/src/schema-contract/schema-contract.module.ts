import { Module } from '@nestjs/common';
import { SchemaContractService } from './schema-contract.service.js';

/**
 * Schema 校验合同模块（G3）。
 *
 * 无外部依赖（校验纯函数化）；被 ProcessModule（流程保存）、PageModule
 * （页面保存）与未来的 McpModule（G4 AI 写路径）引用。
 */
@Module({
  providers: [SchemaContractService],
  exports: [SchemaContractService],
})
export class SchemaContractModule {}
