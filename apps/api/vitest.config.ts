import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Tests do not load .env, but they need the same DB_PORT that docker compose uses (default 5432).
const envFile = new URL('../../.env', import.meta.url);
const dbPort = process.env.DB_PORT ?? (existsSync(envFile) ? readFileSync(envFile, 'utf8').match(/^DB_PORT=(\d+)/m)?.[1] : undefined) ?? '5432';
process.env.TEST_DATABASE_URL ??= `postgres://sporthub:sporthub@localhost:${dbPort}/sporthub_test`;

export default defineConfig({
  test: {
    globalSetup: './test/global-setup.ts',
    setupFiles: './test/setup.ts',
    fileParallelism: false, // one shared test DB
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      RECORD_EXAMPLES: '1',
      CHECKIN_EARLY_MINUTES: String(60 * 24 * 30),
      MAX_DAYS_AHEAD: '60', // most tests book a few days out; the real default (1 day) has its own test
      WEB_DIST: 'test/fixtures/web',
    },
  },
});
