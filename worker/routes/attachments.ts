import {recordEvent} from '../analytics'
import { Hono } from 'hono'
import { apiError, ok, rowNotFound } from '../lib/api'
import { camelizeRow, writeAudit } from '../db/helpers'
import { MAX_ATTACHMENT_BYTES, attachmentType, storeAttachment } from '../services/attachment-store'
import type { Bindings } from '../types'

export const attachmentRoutes = new Hono<{ Bindings: Bindings }>()
  .get('/attachments', async c=>{const homework=c.req.query('homework'),material=c.req.query('material'),id=homework??material;if(!id)return apiError(c,400,'VALIDATION_ERROR','Укажите задание или материал');return ok(c,(await c.env.DB.prepare(`SELECT id,file_name,content_type,byte_size FROM attachments WHERE ${homework?'homework_id':'material_id'}=? ORDER BY created_at,id`).bind(id).all<Record<string,unknown>>()).results.map(camelizeRow))})
  .post('/attachments', async (c) => {
    const form = await c.req.formData()
    const file = form.get('file')
    const ownerType = form.get('ownerType')
    const ownerId = form.get('ownerId')
    if (!(file instanceof File) || typeof ownerType !== 'string' || typeof ownerId !== 'string') {
      return apiError(c, 400, 'VALIDATION_ERROR', 'Нужны file, ownerType и ownerId')
    }
    if (ownerType !== 'message' && ownerType !== 'material' && ownerType !== 'homework') return apiError(c, 400, 'VALIDATION_ERROR', 'Некорректный ownerType')
    if (file.size > MAX_ATTACHMENT_BYTES) return apiError(c, 413, 'FILE_TOO_LARGE', 'Максимальный размер файла — 20 МБ')
    // Телефоны присылают HEIC или пустой MIME — тип определяем и по расширению.
    const type = attachmentType(file.name, file.type)
    if (!type) return apiError(c, 422, 'UNSUPPORTED_MEDIA_TYPE', 'Этот тип файла не поддерживается')
    const table=ownerType==='homework'?'homework':ownerType==='material'?'materials':'messages'
    if(!await c.env.DB.prepare(`SELECT id FROM ${table} WHERE id=?`).bind(ownerId).first())return rowNotFound(c,'Запись')
    const id = await storeAttachment(c.env, { type: ownerType, id: ownerId }, file, type)
    await writeAudit(c.env.DB, { actorType: 'user', action: 'attachment.created', entityType: 'attachment', entityId: id, metadata: { ownerType, ownerId, byteSize: file.size } })
    const row = await c.env.DB.prepare('SELECT * FROM attachments WHERE id = ?').bind(id).first<Record<string, unknown>>()
    return ok(c, camelizeRow(row!), 201)
  })
  .delete('/attachments/:id', async (c) => {
    const id = c.req.param('id')
    const row = await c.env.DB.prepare('SELECT r2_key, homework_id, material_id, message_id FROM attachments WHERE id = ?').bind(id).first<Record<string, unknown>>()
    if (!row) return rowNotFound(c, 'Вложение')
    await c.env.ATTACHMENTS.delete(String(row.r2_key)).catch(() => {})
    await c.env.DB.prepare('DELETE FROM attachments WHERE id = ?').bind(id).run()
    await writeAudit(c.env.DB, { actorType: 'user', action: 'attachment.deleted', entityType: 'attachment', entityId: id, metadata: { homeworkId: row.homework_id ?? null, materialId: row.material_id ?? null } })
    return ok(c, { id, deleted: true })
  })
  .get('/attachments/:id', async (c) => {
    const row = await c.env.DB.prepare('SELECT * FROM attachments WHERE id = ?').bind(c.req.param('id')).first<Record<string, unknown>>()
    if (!row) return rowNotFound(c, 'Вложение')
    const object = await c.env.ATTACHMENTS.get(String(row.r2_key))
    if (!object) return rowNotFound(c, 'Файл вложения')
    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)
    headers.set('cache-control', 'private, no-store')
    if(c.env.OWNER_ID)c.executionCtx.waitUntil(recordEvent(c.env,c.env.OWNER_ID,'document.open',row.homework_id?'tasks':'materials',c.req.header('user-agent')??'',String(row.file_name)).catch(()=>{}))
    return new Response(object.body, { headers })
  })
