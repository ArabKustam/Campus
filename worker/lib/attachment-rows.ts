/** Компактные списки вложений для строк заданий и материалов: {id,fileName,contentType,byteSize}. */
export type AttachmentRow = { id: string; fileName: string; contentType: string; byteSize: number }
export async function attachmentsByOwner(db: D1Database, column: 'homework_id' | 'material_id', ids: string[]) {
  const map = new Map<string, AttachmentRow[]>()
  if (!ids.length) return map
  const rows = (await db.prepare(`SELECT id, ${column} AS owner_id, file_name, content_type, byte_size FROM attachments WHERE ${column} IN (${ids.map(() => '?').join(',')}) ORDER BY created_at, id`).bind(...ids).all<{ id: string; owner_id: string; file_name: string; content_type: string; byte_size: number }>()).results
  for (const row of rows) map.set(row.owner_id, [...(map.get(row.owner_id) ?? []), { id: row.id, fileName: row.file_name, contentType: row.content_type, byteSize: row.byte_size }])
  return map
}
