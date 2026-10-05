import QRCode from 'qrcode'
import { Hono } from 'hono'
import { apiError, ok } from '../lib/api'
import { writeAudit } from '../db/helpers'
import { persistIncomingMessage } from '../integrations/persist-message'
import { whatsappSource, type WhatsAppBridgePayload } from '../integrations/message-source'
import type { Bindings } from '../types'

const mockGroups = [
  { id: '120363001@g.us', name: 'ИБ-23 · Общая группа' },
  { id: '120363002@g.us', name: 'Практикум по программированию' },
]

async function synchronizeMockPairing(db: D1Database) {
  const integration = await db.prepare("SELECT config_json, status FROM integrations WHERE provider = 'whatsapp'").first<{ config_json: string; status: string }>()
  if (integration?.status !== 'pairing') return
  const config = JSON.parse(integration.config_json) as { pairingStartedAt?: string }
  if (!config.pairingStartedAt || Date.now() - Date.parse(config.pairingStartedAt) < 1_500) return
  await db.prepare("UPDATE integrations SET status = 'connected', config_json = '{}', last_sync_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE provider = 'whatsapp'").run()
  for (const group of mockGroups) {
    await db.prepare(`
      INSERT INTO message_sources (id, integration_id, provider, external_chat_id, name, source_type)
      VALUES (?, 'integration-whatsapp', 'whatsapp', ?, ?, 'group')
      ON CONFLICT(provider, external_chat_id) DO UPDATE SET name = excluded.name, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    `).bind(`source-whatsapp-${group.id.split('@')[0]}`, group.id, group.name).run()
  }
}

async function whatsappState(db: D1Database) {
  await synchronizeMockPairing(db)
  const integration = await db.prepare("SELECT status, config_json, last_sync_at FROM integrations WHERE provider = 'whatsapp'").first<{ status: string; config_json: string; last_sync_at: string | null }>()
  const config = integration ? JSON.parse(integration.config_json) as { qrDataUrl?: string } : {}
  const groups = await db.prepare("SELECT id, external_chat_id, name, is_enabled FROM message_sources WHERE provider = 'whatsapp' ORDER BY name").all<Record<string, unknown>>()
  return {
    status: integration?.status ?? 'disconnected',
    connected: integration?.status === 'connected',
    qrDataUrl: integration?.status === 'pairing' ? config.qrDataUrl ?? null : null,
    lastSyncAt: integration?.last_sync_at ?? null,
    groups: groups.results.map((row) => ({ id: row.external_chat_id, name: row.name, selected: Boolean(row.is_enabled) })),
    bridgeMode: 'external' as const,
  }
}

export const whatsappRoutes = new Hono<{ Bindings: Bindings }>()
  .get('/integrations/whatsapp', async (c) => ok(c, await whatsappState(c.env.DB)))
  .post('/integrations/whatsapp/connect', async (c) => {
    const pairingPayload = `campus-whatsapp-bridge:${crypto.randomUUID()}`
    const svg = await QRCode.toString(pairingPayload, { type: 'svg', margin: 1, width: 256 })
    const qrDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
    const config = JSON.stringify({ qrDataUrl, pairingStartedAt: new Date().toISOString() })
    await c.env.DB.prepare("UPDATE integrations SET status = 'pairing', config_json = ?, last_error = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE provider = 'whatsapp'").bind(config).run()
    await writeAudit(c.env.DB, { actorType: 'user', action: 'integration.pairing_started', entityType: 'integration', entityId: 'integration-whatsapp' })
    return ok(c, await whatsappState(c.env.DB), 201)
  })
  .put('/integrations/whatsapp/groups/:groupId', async (c) => {
    const groupId = c.req.param('groupId')
    const existing = await c.env.DB.prepare("SELECT id FROM message_sources WHERE provider = 'whatsapp' AND external_chat_id = ?").bind(groupId).first()
    if (!existing) return apiError(c, 404, 'NOT_FOUND', 'WhatsApp-группа не найдена')
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE message_sources SET is_enabled = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE provider = 'whatsapp'"),
      c.env.DB.prepare("UPDATE message_sources SET is_enabled = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE provider = 'whatsapp' AND external_chat_id = ?").bind(groupId),
    ])
    return ok(c, await whatsappState(c.env.DB))
  })
  .delete('/integrations/whatsapp', async (c) => {
    await c.env.DB.prepare("UPDATE integrations SET status = 'disconnected', config_json = '{}', last_sync_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE provider = 'whatsapp'").run()
    await writeAudit(c.env.DB, { actorType: 'user', action: 'integration.disconnected', entityType: 'integration', entityId: 'integration-whatsapp', metadata: { provider: 'whatsapp' } })
    return ok(c, await whatsappState(c.env.DB))
  })
  .post('/bridges/whatsapp/messages', async (c) => {
    if (!c.env.WHATSAPP_BRIDGE_SECRET || c.req.header('x-whatsapp-bridge-secret') !== c.env.WHATSAPP_BRIDGE_SECRET) return apiError(c, 401, 'INVALID_BRIDGE_SECRET', 'Неверный секрет WhatsApp Bridge')
    const payload = await c.req.json<WhatsAppBridgePayload>()
    const message = whatsappSource.normalize(payload)
    if (!message) return ok(c, { accepted: true, stored: false, reason: 'private_message' })
    const source = await c.env.DB.prepare("SELECT is_enabled FROM message_sources WHERE provider = 'whatsapp' AND external_chat_id = ?").bind(message.externalChatId).first<{ is_enabled: number }>()
    if (!source?.is_enabled) return ok(c, { accepted: true, stored: false, reason: 'source_not_enabled' })
    const persisted = await persistIncomingMessage(c.env, 'integration-whatsapp', message)
    await c.env.DB.prepare("UPDATE integrations SET last_sync_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE provider = 'whatsapp'").run()
    return ok(c, { accepted: true, stored: persisted.stored })
  })
