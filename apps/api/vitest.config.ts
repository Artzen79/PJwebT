import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './test/global-setup.ts',
    setupFiles: './test/setup.ts',
    fileParallelism: false, // one shared test DB
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://sporthub:sporthub@localhost:5432/sporthub_test',
      SMTP_URL: 'smtp://localhost:1025',
      RECORD_EXAMPLES: '1',
      CHECKIN_EARLY_MINUTES: String(60 * 24 * 30),
      WEB_DIST: 'test/fixtures/web',
    },
  },
});
