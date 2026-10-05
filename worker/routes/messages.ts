import { Hono } from 'hono'
import { ok, validationError } from '../lib/api'
import { camelizeRow } from '../db/helpers'
import { listQuerySchema } from '../schemas/api'
import type { Bindings } from '../types'

export const messageRoutes = new Hono<{ Bindings: Bindings }>()
  .get('/messages', async (c) => {
    const parsed = listQuerySchema.safeParse(c.req.query())
    if (!parsed.success) return validationError(c, parsed.error)
    const { limit, cursor, status } = parsed.data
    const processed = status === 'processed' ? 1 : status === 'unprocessed' ? 0 : null
    const result = await c.env.DB.prepare(`
      SELECT
        m.*, ms.name AS chat_name, ms.external_chat_id AS chat_id,
        COALESCE(json_group_array(json_object(
          'id', a.id, 'fileName', a.file_name, 'contentType', a.content_type,
          'byteSize', a.byte_size
        )) FILTER (WHERE a.id IS NOT NULL), '[]') AS attachments_json
      FROM messages m
      JOIN message_sources ms ON ms.id = m.source_id
      LEFT JOIN attachments a ON a.message_id = m.id
      WHERE (? IS NULL OR m.sent_at < ?)
        AND (? IS NULL OR (m.processed_at IS NOT NULL) = ?)
      GROUP BY m.id
      ORDER BY m.sent_at DESC
      LIMIT ?
    `).bind(cursor ?? null, cursor ?? null, processed, processed, limit + 1).all<Record<string, unknown>>()
    const hasMore = result.results.length > limit
    const rows = result.results.slice(0, limit)
    return ok(c, rows.map((row) => camelizeRow(row)), 200, {
      limit,
      hasMore,
      nextCursor: hasMore ? String(rows.at(-1)?.sent_at) : null,
    })
  })
