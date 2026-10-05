/** Small private attachments use the same isolated SQLite storage, avoiding an R2 billing prerequisite. */
export function workspaceFiles(storage: DurableObjectStorage): R2Bucket {
  storage.sql.exec(`CREATE TABLE IF NOT EXISTS private_files (key TEXT PRIMARY KEY, etag TEXT NOT NULL, metadata TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS private_file_chunks (file_key TEXT NOT NULL REFERENCES private_files(key) ON DELETE CASCADE, part INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(file_key, part));`)
  return {
    async put(key: string, value: ReadableStream | ArrayBuffer | Uint8Array, options?: { httpMetadata?: Record<string, string> }) {
      const etag = crypto.randomUUID()
      storage.sql.exec('INSERT INTO private_files (key, etag, metadata) VALUES (?, ?, ?)', key, etag, JSON.stringify(options?.httpMetadata ?? {}))
      const stream = value instanceof ReadableStream ? value : new Blob([value as BlobPart]).stream()
      const reader = stream.getReader()
      let total = 0, part = 0
      try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          total += chunk.value.byteLength
          if (total > 20 * 1024 * 1024) throw new Error('FILE_TOO_LARGE')
          for (let offset = 0; offset < chunk.value.byteLength; offset += 512 * 1024) {
            storage.sql.exec('INSERT INTO private_file_chunks VALUES (?, ?, ?)', key, part++, chunk.value.slice(offset, offset + 512 * 1024))
          }
        }
      } catch (error) {
        await reader.cancel().catch(() => {})
        storage.sql.exec('DELETE FROM private_files WHERE key = ?', key)
        throw error
      } finally { reader.releaseLock() }
      return { key, etag }
    },
    async get(key: string) {
      const row = storage.sql.exec('SELECT etag, metadata FROM private_files WHERE key = ?', key).toArray()[0]
      if (!row) return null
      let part = 0
      const body = new ReadableStream({ pull(controller) {
        const chunk = storage.sql.exec('SELECT data FROM private_file_chunks WHERE file_key = ? AND part = ?', key, part++).toArray()[0]
        if (!chunk) { controller.close(); return }
        controller.enqueue(new Uint8Array(chunk.data as ArrayBuffer))
      } })
      return { body, httpEtag: `"${row.etag}"`, writeHttpMetadata(headers: Headers) {
        const metadata = JSON.parse(String(row.metadata))
        if (metadata.contentType) headers.set('content-type', metadata.contentType)
        if (metadata.contentDisposition) headers.set('content-disposition', metadata.contentDisposition)
        headers.set('x-content-type-options', 'nosniff')
      } }
    },
    async delete(key: string) { storage.sql.exec('DELETE FROM private_files WHERE key = ?', key) },
  } as unknown as R2Bucket
}
