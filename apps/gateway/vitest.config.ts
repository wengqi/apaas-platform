import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/test/**',
        'src/main.ts',
        'src/**/*.module.ts',
        'src/**/*.controller.ts',
        'dist/**',
      ],
      reporter: ['text', 'text-summary', 'lcov'],
      thresholds: {
        // 2026-09-25 覆盖率冲刺后基线 60%/74%/74%，阈值锁定新地板（留小幅波动余量）
        statements: 58,
        branches: 72,
        functions: 72,
        lines: 58,
      },
    },
  },
});
