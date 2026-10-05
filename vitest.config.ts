import path from 'node:path'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: './wrangler.test.jsonc' },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.resolve('migrations')),
        },
      },
    })),
  ],
  test: {
    setupFiles: ['./worker/tests/apply-migrations.ts'],
    include: ['worker/**/*.test.ts'],
  },
})
