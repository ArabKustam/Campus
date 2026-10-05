export function camelizeRow<T = Record<string, unknown>>(row: Record<string, unknown>): T {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
    if (key.endsWith('_json') && typeof value === 'string') {
      result[camelKey.slice(0, -4)] = JSON.parse(value)
    } else if (key.startsWith('is_') && typeof value === 'number') {
      result[camelKey] = Boolean(value)
    } else {
      result[camelKey] = value
    }
  }
  return result as T
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`
}

export async function writeAudit(db: D1Database, input: {
  actorType: 'user' | 'system' | 'integration' | 'cron'
  actorId?: string
  action: string
  entityType: string
  entityId?: string
  metadata?: Record<string, unknown>
}) {
  await db.prepare(`
    INSERT INTO audit_log (id, actor_type, actor_id, action, entity_type, entity_id, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    newId('audit'),
    input.actorType,
    input.actorId ?? null,
    input.action,
    input.entityType,
    input.entityId ?? null,
    JSON.stringify(input.metadata ?? {}),
  ).run()
}
