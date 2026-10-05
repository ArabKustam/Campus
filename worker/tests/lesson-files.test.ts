import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

const api = (path: string, init: RequestInit = {}) => exports.default.fetch(`http://example.com/api${path}`, init)
const json = (method: string, value: unknown): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) })
const data = async (response: Response) => ((await response.json()) as { data: any }).data
async function upload(ownerType: string, ownerId: string, file: File) {
  const form = new FormData(); form.set('ownerType', ownerType); form.set('ownerId', ownerId); form.set('file', file)
  return api('/attachments', { method: 'POST', body: form })
}

describe('lesson homework, notes and files', () => {
  it('filters homework by lesson, returns attachments and deletes with files', async () => {
    const created = await data(await api('/homework', json('POST', { subjectId: 'subject-programming', scheduleSlotId: 'slot-even-3-2', title: 'Задачи 1–5', dueAt: '2026-09-09T23:59:00.000Z' })))
    await api('/homework', json('POST', { subjectId: 'subject-programming', scheduleSlotId: 'slot-even-3-2', title: 'Старый формат', dueAt: '2026-09-09T18:00:00+05:00' }))
    await api('/homework', json('POST', { subjectId: 'subject-programming', scheduleSlotId: 'slot-even-3-2', title: 'Другая дата', dueAt: '2026-09-16T23:59:00.000Z' }))
    const photo = await upload('homework', created.id, new File(['img'], 'IMG_0001.HEIC', { type: '' }))
    expect(photo.status).toBe(201)
    expect((await data(photo)).contentType).toBe('image/heic')
    const list = await data(await api('/homework?slot=slot-even-3-2&date=2026-09-09'))
    expect(list.map((item: any) => item.title).sort()).toEqual(['Задачи 1–5', 'Старый формат'])
    expect(list.find((item: any) => item.id === created.id).attachments).toMatchObject([{ fileName: 'IMG_0001.HEIC', contentType: 'image/heic' }])
    const key = (await env.DB.prepare('SELECT r2_key FROM attachments WHERE homework_id = ?').bind(created.id).first<{ r2_key: string }>())!.r2_key
    expect((await api(`/homework/${created.id}`, { method: 'DELETE' })).status).toBe(200)
    expect(await env.ATTACHMENTS.get(key)).toBeNull()
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM attachments WHERE homework_id = ?').bind(created.id).first<{ n: number }>())!.n).toBe(0)
    expect((await api(`/homework/${created.id}`, { method: 'DELETE' })).status).toBe(404)
    expect((await upload('homework', 'homework-missing', new File(['x'], 'a.exe', { type: 'application/x-msdownload' }))).status).toBe(422)
  })

  it('stores materials for a specific lesson date, patches, deletes attachments and materials', async () => {
    const own = await data(await api('/materials', json('POST', { subjectId: 'subject-programming', scheduleSlotId: 'slot-even-3-2', lessonDate: '2026-09-09', title: 'Фото доски', kind: 'image' })))
    expect(own.lessonDate).toBe('2026-09-09')
    await api('/materials', json('POST', { subjectId: 'subject-programming', scheduleSlotId: 'slot-even-3-2', title: 'Учебник', kind: 'book' }))
    await api('/materials', json('POST', { subjectId: 'subject-programming', scheduleSlotId: 'slot-even-3-2', lessonDate: '2026-09-16', title: 'Чужая дата', kind: 'document' }))
    const file = await data(await upload('material', own.id, new File(['pdf'], 'notes.pdf', { type: 'application/pdf' })))
    const list = await data(await api('/materials?slot=slot-even-3-2&date=2026-09-09'))
    expect(list.map((item: any) => item.title).sort()).toEqual(['Учебник', 'Фото доски'])
    expect(list.find((item: any) => item.id === own.id).attachments).toHaveLength(1)
    expect(await data(await api(`/attachments?material=${own.id}`))).toHaveLength(1)
    const patched = await api(`/materials/${own.id}`, json('PATCH', { title: 'Доска', lessonDate: null }))
    expect(await data(patched)).toMatchObject({ title: 'Доска', lessonDate: null })
    expect((await api('/materials/material-missing', json('PATCH', { title: 'x' }))).status).toBe(404)
    expect((await api(`/attachments/${file.id}`, { method: 'DELETE' })).status).toBe(200)
    expect((await api(`/attachments/${file.id}`)).status).toBe(404)
    expect((await api(`/materials/${own.id}`, { method: 'DELETE' })).status).toBe(200)
    expect(await env.DB.prepare('SELECT id FROM materials WHERE id = ?').bind(own.id).first()).toBeNull()
    const audit = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action IN ('material.deleted', 'attachment.deleted') AND entity_id IN (?, ?)").bind(own.id, file.id).first<{ n: number }>()
    expect(audit!.n).toBe(2)
  })

  it('marks lessons with homework and date-specific materials in the day schedule', async () => {
    await api('/homework', json('POST', { subjectId: 'subject-ecology', scheduleSlotId: 'slot-even-3-3', title: 'Флаг', dueAt: '2026-09-23T18:00:00+05:00' }))
    await api('/materials', json('POST', { subjectId: 'subject-ecology', scheduleSlotId: 'slot-even-3-3', lessonDate: '2026-09-23', title: 'Флаг', kind: 'document' }))
    const day = await data(await api('/schedule/day?date=2026-09-23'))
    const lesson = day.lessons.find((item: any) => item.scheduleSlotId === 'slot-even-3-3')
    expect(lesson).toBeDefined()
    expect(Boolean(lesson.hasHomework)).toBe(true)
    expect(Boolean(lesson.hasMaterials)).toBe(true)
    const next = await data(await api('/schedule/day?date=2026-10-07'))
    expect(Boolean(next.lessons.find((item: any) => item.scheduleSlotId === 'slot-even-3-3')?.hasMaterials)).toBe(false)
  })
})
