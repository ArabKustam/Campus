import { Hono } from 'hono'
import { z } from 'zod'
import { apiError, ok, validationError } from '../lib/api'
import { newId,writeAudit } from '../db/helpers'
import { persistIncomingMessage } from '../integrations/persist-message'
import { createAiRun, processAiRun } from '../services/processing'
import { attachmentRoutes } from './attachments'
import { MESSAGE_HISTORY_START } from '../lib/message-window'
import type { Bindings } from '../types'
const providerSchema = z.enum(['telegram','whatsapp'])
const messageSchema = z.object({
  provider: providerSchema, externalChatId: z.string().min(1).max(160), externalMessageId: z.string().min(1).max(160),
  chatName: z.string().max(200), sender: z.object({ id: z.string().min(1).max(160), name: z.string().max(200), username: z.string().max(200).nullable().optional(), phone: z.string().regex(/^\+?[1-9]\d{6,14}$/).nullable().optional() }).strict(),
  text: z.string().max(30000).nullable(), sentAt: z.string().datetime({ offset: true }),
  replyTo: z.object({ externalMessageId: z.string().max(160), text: z.string().max(30000).nullable() }).nullable(),
  messageType: z.enum(['text','image','document','audio','video']),
}).strict()
async function state(db: D1Database, provider: string) {
  const row = await db.prepare('SELECT status, config_json, last_sync_at, last_error FROM integrations WHERE provider = ?').bind(provider).first<{ status: string; config_json: string; last_sync_at: string | null; last_error: string | null }>()
  const config = JSON.parse(row?.config_json ?? '{}')
  const groups = (await db.prepare('SELECT external_chat_id AS id, name, (avatar IS NOT NULL) AS hasAvatar, is_enabled AS selected FROM message_sources WHERE provider = ? ORDER BY display_order, name').bind(provider).all()).results
  return { status: row?.status ?? 'disconnected', lastSyncAt: row?.last_sync_at, error: row?.last_error, desired: config.desired ?? 'disconnected', revision: config.revision ?? 0, groups:groups.map(g=>({...g,avatar:g.hasAvatar?`/api/personal/${provider}/groups/${encodeURIComponent(String(g.id))}/avatar`:null})), historyStart: MESSAGE_HISTORY_START }
}
export const personalRoutes = new Hono<{ Bindings: Bindings }>()
  .get('/personal/:provider', async (c) => {
    const p = providerSchema.safeParse(c.req.param('provider')); if (!p.success) return validationError(c, p.error)
    return ok(c, await state(c.env.DB, p.data))
  })
  .post('/personal/:provider/connect', async (c) => {
    const p = providerSchema.safeParse(c.req.param('provider')); if (!p.success) return validationError(c, p.error)
    const previous = await state(c.env.DB, p.data)
    await c.env.DB.prepare("UPDATE integrations SET status = 'pairing', config_json = ?, last_error = NULL WHERE provider = ?").bind(JSON.stringify({ desired: 'connected', revision: previous.revision + 1 }), p.data).run()
    await writeAudit(c.env.DB,{actorType:'user',action:'integration.pairing_started',entityType:'integration',entityId:p.data})
    return ok(c, await state(c.env.DB, p.data))
  })
  .delete('/personal/:provider', async (c) => {
    const p = providerSchema.safeParse(c.req.param('provider')); if (!p.success) return validationError(c, p.error)
    const previous = await state(c.env.DB, p.data)
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE integrations SET status = 'disconnected', config_json = ?, last_error = NULL WHERE provider = ?").bind(JSON.stringify({ desired: 'disconnected', revision: previous.revision + 1 }), p.data),
      c.env.DB.prepare('UPDATE message_sources SET is_enabled = 0 WHERE provider = ?').bind(p.data),
    ])
    return ok(c, await state(c.env.DB, p.data))
  })
  .put('/personal/:provider/groups/:id', async (c) => {
    const p = providerSchema.safeParse(c.req.param('provider')); if (!p.success) return validationError(c, p.error)
    const body = z.object({ selected: z.boolean() }).safeParse(await c.req.json()); if (!body.success) return validationError(c, body.error)
    const row = await c.env.DB.prepare('UPDATE message_sources SET is_enabled = ? WHERE provider = ? AND external_chat_id = ? RETURNING id').bind(Number(body.data.selected), p.data, c.req.param('id')).first()
    if(row)await writeAudit(c.env.DB,{actorType:'user',action:'source.selected',entityType:'source',entityId:String(row.id),metadata:{provider:p.data,selected:body.data.selected}})
    return row ? ok(c, await state(c.env.DB, p.data)) : apiError(c, 404, 'NOT_FOUND', 'Чат не найден')
  })
  .get('/connector/config', async (c) => ok(c, { accountId: c.env.OWNER_ID, telegram: await state(c.env.DB, 'telegram'), whatsapp: await state(c.env.DB, 'whatsapp') }))
  .post('/connector/status', async (c) => {
    const parsed = z.object({ provider: providerSchema, revision: z.number().int(), status: z.enum(['pairing','connected','error','disconnected']), error: z.string().max(500).nullable().optional() }).safeParse(await c.req.json())
    if (!parsed.success) return validationError(c, parsed.error)
    const current = await state(c.env.DB, parsed.data.provider)
    if (current.revision !== parsed.data.revision || current.desired !== 'connected') return apiError(c, 409, 'STALE_CONNECTION', 'Подключение уже отменено')
    await c.env.DB.prepare("UPDATE integrations SET status = ?, last_error = ?, last_sync_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE provider = ?").bind(parsed.data.status, parsed.data.error ?? null, parsed.data.provider).run()
    if(current.status!==parsed.data.status)await writeAudit(c.env.DB,{actorType:'integration',action:`integration.${parsed.data.status}`,entityType:'integration',entityId:parsed.data.provider})
    return ok(c, { saved: true })
  })
  .post('/connector/groups', async (c) => {
    const parsed = z.object({ provider: providerSchema, revision: z.number().int(), offset:z.number().int().min(0).max(500).default(0), groups: z.array(z.object({ id: z.string().min(1).max(160), name: z.string().min(1).max(200), avatar: z.string().max(90000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/).nullable().optional() })).max(500) }).safeParse(await c.req.json())
    if (!parsed.success) return validationError(c, parsed.error)
    const current = await state(c.env.DB, parsed.data.provider)
    if (current.revision !== parsed.data.revision || current.desired !== 'connected') return apiError(c, 409, 'STALE_CONNECTION', 'Подключение уже отменено')
    if (parsed.data.groups.length) await c.env.DB.batch(parsed.data.groups.map((group,index) => c.env.DB.prepare(`INSERT INTO message_sources (id, integration_id, provider, external_chat_id, name, source_type, is_enabled, avatar, display_order)
      VALUES (?, ?, ?, ?, ?, 'group', 0, ?, ?) ON CONFLICT(provider, external_chat_id) DO UPDATE SET name = excluded.name,avatar=coalesce(excluded.avatar,message_sources.avatar),display_order=excluded.display_order`).bind(newId('source'), `integration-${parsed.data.provider}`, parsed.data.provider, group.id, group.name,group.avatar??null,index+parsed.data.offset)))
    return ok(c, { saved: true })
  })
  .post('/connector/messages', async (c) => {
    const parsed = messageSchema.safeParse(await c.req.json())
    if (!parsed.success) return validationError(c, parsed.error)
    const input = parsed.data
    const source = await c.env.DB.prepare(`SELECT s.id FROM message_sources s JOIN integrations i ON i.id = s.integration_id WHERE s.provider = ? AND s.external_chat_id = ? AND s.is_enabled = 1 AND i.status = 'connected'`).bind(input.provider, input.externalChatId).first()
    if (!source) return ok(c, { stored: false, messageId: null, reason: 'source_not_enabled' })
    const sanitized = { ...input, replyTo: input.replyTo ? { externalMessageId: input.replyTo.externalMessageId, text: null } : null }
    const result = await persistIncomingMessage(c.env, `integration-${input.provider}`, { ...sanitized, attachment: null, rawPayload: sanitized })
    const file = result.messageId ? await c.env.DB.prepare('SELECT id FROM attachments WHERE message_id = ? LIMIT 1').bind(result.messageId).first() : null
    return ok(c, { stored: result.stored, messageId: result.messageId, needsAttachment: result.messageId !== null && !file })
  })
  .post('/connector/attachments/:messageId', async (c) => {
    const row = await c.env.DB.prepare('SELECT m.id FROM messages m JOIN message_sources s ON s.id = m.source_id WHERE m.id = ? AND s.is_enabled = 1').bind(c.req.param('messageId')).first()
    if (!row) return apiError(c, 404, 'NOT_FOUND', 'Сообщение не найдено')
    const form = await c.req.formData()
    form.set('ownerType', 'message'); form.set('ownerId', c.req.param('messageId'))
    return attachmentRoutes.fetch(new Request('https://workspace/attachments', { method: 'POST', body: form }), c.env, c.executionCtx)
  })

personalRoutes.post('/connector/analyze',async c=>{
 const run=await createAiRun(c.env,'manual')
 await processAiRun(c.env,run.id)
 const result=await c.env.DB.prepare('SELECT id,status,messages_scanned AS messagesScanned,actions_created AS actionsCreated,error FROM ai_runs WHERE id=?').bind(run.id).first()
 return ok(c,result)
})

personalRoutes.get('/personal/:provider/groups/:id/avatar',async c=>{
 const p=providerSchema.safeParse(c.req.param('provider'));if(!p.success)return validationError(c,p.error)
 const row=await c.env.DB.prepare('SELECT avatar FROM message_sources WHERE provider=? AND external_chat_id=?').bind(p.data,c.req.param('id')).first<{avatar:string|null}>()
 if(!row?.avatar)return apiError(c,404,'NOT_FOUND','Аватар недоступен')
 const match=row.avatar.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/)
 if(!match)return apiError(c,404,'NOT_FOUND','Аватар недоступен')
 return new Response(Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0)),{headers:{'content-type':match[1],'cache-control':'private, max-age=300','x-content-type-options':'nosniff'}})
})
