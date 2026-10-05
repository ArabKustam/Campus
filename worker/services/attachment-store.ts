import { newId } from '../db/helpers'
import type { Bindings } from '../types'

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
export const allowedAttachmentTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
])
const byExtension: Record<string, string> = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', txt: 'text/plain', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif' }

export type AttachmentOwner = { type: 'message' | 'material' | 'homework'; id: string }

/** Телефоны иногда присылают пустой или общий MIME-тип — тогда определяем тип по расширению. */
export function attachmentType(fileName: string, declared: string) {
  if (allowedAttachmentTypes.has(declared)) return declared
  return byExtension[fileName.split('.').pop()?.toLowerCase() ?? ''] ?? null
}

export function safeFileName(fileName: string) {
  return fileName.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 120) || 'file'
}

export function storageKey(prefix: string, ownerId: string, fileName: string) {
  return `${prefix}/${ownerId}/${crypto.randomUUID()}-${safeFileName(fileName)}`
}

export async function putFile(env: Bindings, key: string, body: ReadableStream | ArrayBuffer | Uint8Array, contentType: string, fileName: string) {
  await env.ATTACHMENTS.put(key, body, { httpMetadata: { contentType, contentDisposition: `inline; filename="${safeFileName(fileName)}"` } })
}

/** Создаёт строку attachments для уже сохранённого файла. */
export async function linkAttachment(env: Bindings, owner: AttachmentOwner, file: { key: string; fileName: string; contentType: string; byteSize: number }) {
  const id = newId('attachment'), column = owner.type === 'message' ? 'message_id' : owner.type === 'material' ? 'material_id' : 'homework_id'
  await env.DB.prepare(`INSERT INTO attachments (id, ${column}, r2_key, file_name, content_type, byte_size) VALUES (?, ?, ?, ?, ?, ?)`).bind(id, owner.id, file.key, file.fileName, file.contentType, file.byteSize).run()
  return id
}

/** Сохраняет файл и сразу привязывает его; при ошибке записи в базу файл удаляется. */
export async function storeAttachment(env: Bindings, owner: AttachmentOwner, file: File, contentType: string) {
  const key = storageKey(owner.type, owner.id, file.name)
  await putFile(env, key, file.stream(), contentType, file.name)
  try { return await linkAttachment(env, owner, { key, fileName: file.name, contentType, byteSize: file.size }) }
  catch (error) { await env.ATTACHMENTS.delete(key); throw error }
}

/** Удаляет файлы вложений из хранилища; строки удаляет вызывающий код (или каскад). */
export async function deleteStoredFiles(env: Bindings, where: string, id: string) {
  const rows = (await env.DB.prepare(`SELECT r2_key FROM attachments WHERE ${where} = ?`).bind(id).all<{ r2_key: string }>()).results
  for (const row of rows) await env.ATTACHMENTS.delete(row.r2_key).catch(() => {})
}
