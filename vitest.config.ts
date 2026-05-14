import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/cli/index.ts', 'src/shared/paths.ts'],
      thresholds: {
        lines: 90,
        functions: 85,
        branches: 80,
        statements: 90
      }
    }
  }
});
