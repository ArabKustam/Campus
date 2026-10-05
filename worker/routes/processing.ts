import { Hono } from 'hono'
import { ok } from '../lib/api'
import { camelizeRow } from '../db/helpers'
import { createAiRun, processAiRun } from '../services/processing'
import type { Bindings } from '../types'

export const processingRoutes = new Hono<{ Bindings: Bindings }>()
  .get('/processing', async (c) => {
    const [counts, actions, runs] = await Promise.all([
      c.env.DB.prepare(`
        SELECT
          (SELECT COUNT(*) FROM messages WHERE processed_at IS NULL) AS awaiting_analysis,
          (SELECT COUNT(*) FROM ai_actions) AS changes_found,
          (SELECT COUNT(*) FROM ai_actions WHERE status = 'suggested') AS requires_review,
          (SELECT COUNT(*) FROM messages WHERE processed_at >= date('now')) AS processed_today
      `).first<Record<string, unknown>>(),
      c.env.DB.prepare(`
        SELECT aa.*, s.name AS subject_name, ss.slot_number, m.text AS message_text, ms.name AS chat_name, m.provider
        FROM ai_actions aa
        LEFT JOIN subjects s ON s.id = aa.subject_id
        LEFT JOIN schedule_slots ss ON ss.id = aa.target_schedule_slot_id
        LEFT JOIN messages m ON m.id = aa.message_id
        LEFT JOIN message_sources ms ON ms.id = m.source_id
        ORDER BY aa.created_at DESC LIMIT 100
      `).all<Record<string, unknown>>(),
      c.env.DB.prepare('SELECT * FROM ai_runs ORDER BY created_at DESC LIMIT 30').all<Record<string, unknown>>(),
    ])
    return ok(c, {
      statistics: camelizeRow(counts ?? {}),
      actions: actions.results.map((row) => camelizeRow(row)),
      runs: runs.results.map((row) => camelizeRow(row)),
    })
  })
  .post('/processing/run', async (c) => {
    const run = await createAiRun(c.env, 'manual')
    c.executionCtx.waitUntil(processAiRun(c.env, run.id))
    return ok(c, run, 202)
  })
