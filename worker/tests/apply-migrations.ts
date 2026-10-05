import groupsSql from '../../account-migrations/0002_groups.sql'
import { beforeAll } from 'vitest'
import { env } from 'cloudflare:workers'
import { applyD1Migrations } from 'cloudflare:test'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
  await env.DB.batch(groupsSql.split(';').map(s=>s.trim()).filter(Boolean).map(sql=>env.DB.prepare(sql)))
})
