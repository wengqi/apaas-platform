import { Module, forwardRef } from '@nestjs/common';
import { RecordService } from './record.service.js';
import { RecordImportExportService } from './record-import-export.service.js';
import { RollupService } from './rollup.service.js';
import { RecordController } from './record.controller.js';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from '../auth/jwt.strategy.js';
import { FormulaEngine } from '../object/formula-engine.js';
import { AutoNumberGenerator } from '../object/auto-number.js';
import { PermissionModule } from '../permission/permission.module.js';
import { ProcessModule } from '../process/process.module.js';

/**
 * 记录模块 — 基于 JSONB 宽表的记录 CRUD + 批量操作 + CSV 导入导出。
 * 独立持有 JwtModule + JwtStrategy，使记录路由可受 JWT 保护。
 * 导入 PermissionModule 使 PermissionGuard 可注入。
 *
 * 注册 FormulaEngine 与 AutoNumberGenerator，供 RecordService 在
 * 创建/更新记录时计算公式字段与生成自动编号。
 */
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me',
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '7d' },
      }),
    }),
    PermissionModule,
    forwardRef(() => ProcessModule),
  ],
  controllers: [RecordController],
  providers: [
    RecordService,
    RecordImportExportService,
    JwtStrategy,
    FormulaEngine,
    AutoNumberGenerator,
    RollupService,
  ],
  exports: [RecordService, RecordImportExportService],
})
export class RecordModule {}
