import { defineConfig } from 'vitest/config';

// Dummy env values — test'ler DB'ye dokunmuyor; config.ts boot guard'ını geçsin diye.
// Gerçek integration test sırasında bu dosya override edilmeli.
process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:5432/test';
process.env.JWT_SECRET ??= 'test-secret';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
});
