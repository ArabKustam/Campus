import { Hono } from 'hono'
import { z } from 'zod'
import { ok, validationError } from '../lib/api'
import { writeAudit } from '../db/helpers'
import type { Bindings } from '../types'

const settingValueSchema = z.record(z.string(), z.unknown())

export const settingRoutes = new Hono<{ Bindings: Bindings }>()
  .get('/usage', async c => {
    const today = await c.env.DB.prepare("SELECT count(*) AS requests, coalesce(sum(status='failed'),0) AS failures, sum(input_tokens) AS inputTokens, sum(output_tokens) AS outputTokens FROM ai_usage WHERE created_at>=strftime('%Y-%m-%dT00:00:00.000Z','now')").first()
    const recent = await c.env.DB.prepare('SELECT purpose,status,error,duration_ms AS durationMs,created_at AS createdAt FROM ai_usage ORDER BY created_at DESC LIMIT 20').all()
    const processingErrors = (await c.env.DB.prepare("SELECT error,completed_at AS createdAt FROM ai_runs WHERE status='failed' ORDER BY created_at DESC LIMIT 10").all()).results
    return ok(c,{processingErrors,model:c.env.AI_MODEL,workspaceBytes:c.env.WORKSPACE_BYTES??null,workspaceLimitBytes:1024**3,dailyRequestLimit:100,quotaReset:'00:00 UTC',globalRemaining:null,today,recent:recent.results})
  })
  .get('/storage', async (c) => ok(c, await c.env.DB.prepare('SELECT (SELECT count(*) FROM messages) AS messages, (SELECT count(*) FROM attachments) AS files, (SELECT coalesce(sum(byte_size), 0) FROM attachments) AS bytes').first()))
  .get('/settings', async (c) => {
    const rows = await c.env.DB.prepare('SELECT key, value_json, updated_at FROM settings ORDER BY key').all<{ key: string; value_json: string; updated_at: string }>()
    return ok(c, Object.fromEntries(rows.results.map((row) => [row.key, { value: JSON.parse(row.value_json), updatedAt: row.updated_at }])))
  })
  .patch('/settings/:key', async (c) => {
    let body: unknown = null
    try { body = await c.req.json() } catch { body = null }
    const parsed = settingValueSchema.safeParse(body)
    if (!parsed.success) return validationError(c, parsed.error)
    await c.env.DB.prepare(`
      INSERT INTO settings (key, value_json) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    `).bind(c.req.param('key'), JSON.stringify(parsed.data)).run()
    await writeAudit(c.env.DB, { actorType: 'user', action: 'settings.updated', entityType: 'settings', entityId: c.req.param('key') })
    return ok(c, { key: c.req.param('key'), value: parsed.data })
  })
