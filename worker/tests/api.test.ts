import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

async function json(response: Response) {
  return response.json() as Promise<Record<string, any>>
}

describe('Campus Worker API', () => {
  it('returns a frontend-safe Telegram integration state', async () => {
    const response = await exports.default.fetch('http://example.com/api/integrations/telegram')
    expect(response.status).toBe(200)
    expect((await json(response)).data).toMatchObject({
      connected: false,
      status: 'disconnected',
      bot: null,
      connectedAt: null,
      lastTestedAt: null,
      groups: [],
    })
  })

  it('returns health and a seeded odd-week day', async () => {
    const health = await exports.default.fetch('https://campus.test/health')
    expect(health.status).toBe(200)
    expect(await json(health)).toEqual({ ok: true, data: { service: 'campus-worker' } })

    const response = await exports.default.fetch('https://campus.test/api/schedule/day?date=2026-09-03')
    const body = await json(response)
    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.weekType).toBe('odd')
    expect(body.data.lessons).toHaveLength(4)
    expect(body.data.lessons[0]).toMatchObject({ status: 'normal', date: '2026-09-03' })
  })

  it('returns a typed validation error instead of accepting invalid dates', async () => {
    const response = await exports.default.fetch('https://campus.test/api/schedule/day?date=03.09.2026')
    const body = await json(response)
    expect(response.status).toBe(400)
    expect(body).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })
    expect(body.error.issues[0].path).toBe('date')
  })

  it('creates and updates a date-specific lesson override', async () => {
    const createResponse = await exports.default.fetch('https://campus.test/api/lesson-overrides', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scheduleSlotId: 'slot-odd-4-1', lessonDate: '2026-09-03', status: 'cancelled', note: 'Сообщение группы' }),
    })
    const created = await json(createResponse)
    expect(createResponse.status).toBe(201)
    expect(created.data.status).toBe('cancelled')

    const patchResponse = await exports.default.fetch(`https://campus.test/api/lesson-overrides/${created.data.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'online', onlineUrl: 'https://meet.example/lesson' }),
    })
    const patched = await json(patchResponse)
    expect(patchResponse.status).toBe(200)
    expect(patched.data).toMatchObject({ status: 'online', onlineUrl: 'https://meet.example/lesson' })

    const noteOnly = await exports.default.fetch(`https://campus.test/api/lesson-overrides/${created.data.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: 'Только заметка' }),
    })
    expect((await json(noteOnly)).data).toMatchObject({ status: 'online', note: 'Только заметка' })
  })

  it('creates homework and materials with typed response envelopes', async () => {
    const homeworkResponse = await exports.default.fetch('https://campus.test/api/homework', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subjectId: 'subject-programming', title: 'Лабораторная №4', dueAt: '2026-09-10T09:00:00.000Z' }),
    })
    const homework = await json(homeworkResponse)
    expect(homeworkResponse.status).toBe(201)
    expect(homework).toMatchObject({ ok: true, data: { status: 'open', title: 'Лабораторная №4' } })

    const materialResponse = await exports.default.fetch('https://campus.test/api/materials', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subjectId: 'subject-programming', title: 'Методичка', kind: 'document' }),
    })
    expect(materialResponse.status).toBe(201)
    expect(await json(materialResponse)).toMatchObject({ ok: true, data: { kind: 'document', title: 'Методичка' } })
  })
})
