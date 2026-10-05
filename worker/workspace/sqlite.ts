/** The existing domain uses the D1 query interface; every adapter owns exactly one DO's SQLite. */
export function workspaceDatabase(storage: DurableObjectStorage): D1Database {
  class Statement {
    constructor(private query: string, private values: unknown[] = []) {}
    bind(...values: unknown[]) { return new Statement(this.query, values) }
    execute() {
      const cursor = storage.sql.exec(this.query, ...this.values as SqlStorageValue[])
      const results = cursor.toArray()
      const changes = Number(storage.sql.exec('SELECT changes() AS n').one().n)
      return { success: true, results, meta: { changes, duration: 0, rows_read: cursor.rowsRead, rows_written: cursor.rowsWritten, last_row_id: 0, changed_db: changes > 0, size_after: 0 } }
    }
    async all() { return this.execute() }
    async run() { return this.execute() }
    async first(column?: string) { const row = this.execute().results[0]; return row ? (column ? row[column] : row) : null }
    async raw() { return this.execute().results.map((row) => Object.values(row)) }
  }
  return {
    prepare: (query: string) => new Statement(query),
    batch: async (statements: Statement[]) => storage.transactionSync(() => statements.map((statement) => statement.execute())),
    exec: async (query: string) => { storage.sql.exec(query); return { count: 1, duration: 0 } },
  } as unknown as D1Database
}
