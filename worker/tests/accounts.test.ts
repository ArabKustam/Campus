import { env } from 'cloudflare:workers'
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import worker from '../index'
async function call(path: string, options: { cookie?: string; method?: string; body?: unknown; bearer?: string; headers?: Record<string,string> } = {}) {
  const ctx = createExecutionContext()
  const request = new Request(`https://campus.test/api${path}`, { method: options.method ?? (options.body === undefined ? 'GET' : 'POST'), headers: { 'x-campus-request': '1', origin: 'https://campus.test', ...(options.cookie ? { cookie: options.cookie } : {}), ...(options.bearer ? { authorization: `Bearer ${options.bearer}` } : {}), ...(options.body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...options.headers }, ...(options.body === undefined ? {} : { body: options.body instanceof FormData ? options.body : JSON.stringify(options.body) }) })
  const response = await worker.fetch(request, env, ctx)
  await waitOnExecutionContext(ctx)
  return response
}
async function register(login: string) {
  const response = await call('/auth/register', { body: { login, password: 'Long-unique-test-password!', displayName: login } })
  expect(response.status, await response.clone().text()).toBe(201)
  const id=(await response.clone().json() as any).data.id;await env.DB.prepare('INSERT INTO account_permissions VALUES(?,?)').bind(id,JSON.stringify(['ai','groups','messengers','tasks'])).run()
  return response.headers.get('set-cookie')!.split(';')[0]
}
async function data(response: Response) { const body = await response.json() as any; expect(body.ok, JSON.stringify(body)).toBe(true); return body.data }

describe('public account boundary', () => {
  it('requires authentication and rejects cross-origin writes and legacy integrations', async () => {
    expect((await call('/schedule/day?date=2026-09-07')).status).toBe(401)
    expect((await call('/auth/register', { body: { login: 'csrf', password: 'Long-unique-test-password!' }, headers: { origin: 'https://evil.test' } })).status).toBe(403)
    const cookie = await register('boundary')
    expect((await call('/integrations/whatsapp', { cookie })).status).toBe(410)
    expect((await call('/auth/me', { cookie })).status).toBe(200)
    await call('/auth/logout', { cookie, method: 'POST' })
    expect((await call('/auth/me', { cookie })).status).toBe(401)
  })
  it('isolates settings, schedules, people and private files even when foreign IDs are known', async () => {
    const alice = await register('alice'), bob = await register('bob')
    const day = await call('/schedule/day?date=2026-09-07', { cookie: alice })
    expect(day.status, await day.clone().text()).toBe(200)
    await call('/settings/private-label', { cookie: alice, method: 'PATCH', body: { value: 'ALICE-SECRET' } })
    expect(JSON.stringify(await data(await call('/settings', { cookie: bob })))).not.toContain('ALICE-SECRET')
    const person = await data(await call('/people', { cookie: alice, body: { name: 'Alice curator', role: 'curator', trusted: true } }))
    expect((await call(`/people/${person.id}`, { cookie: bob, method: 'PATCH', body: { name: 'Stolen', role: 'student' } })).status).toBe(404)
    const aliceSubject=await data(await call('/catalog/subjects', {cookie:alice,body:{name:'Программирование',shortName:null,color:'#2563eb'}}))
    const homework = await data(await call('/homework', { cookie: alice, body: { subjectId: aliceSubject.id, title: 'ALICE HOMEWORK' } }))
    const form = new FormData(); form.set('ownerType','homework'); form.set('ownerId', homework.id); form.set('file', new File(['ALICE FILE'], 'private.pdf', { type: 'application/pdf' }))
    const attachment = await data(await call('/attachments', { cookie: alice, body: form }))
    const downloaded = await call(`/attachments/${attachment.id}`, { cookie: alice })
    expect(downloaded.headers.get('cache-control')).toContain('no-store')
    expect(new TextDecoder().decode(await downloaded.arrayBuffer())).toBe('ALICE FILE')
    expect((await call(`/attachments/${attachment.id}`, { cookie: bob })).status).toBe(404)
    expect(JSON.stringify(await data(await call('/homework', { cookie: bob })))).not.toContain('ALICE HOMEWORK')
  })
  it('binds connector tokens to an owner and limited routes, checks selection, cutoff and revocation', async () => {
    const cookie = await register('connector')
    const bob = await register('connector-bob')
    const { token } = await data(await call('/auth/connector-token', { cookie, method: 'POST' }))
    expect((await call('/settings', { bearer: token })).status).toBe(403)
    await call('/personal/telegram/connect', { cookie, method: 'POST' })
    const config = await data(await call('/connector/config', { bearer: token }))
    const revision = config.telegram.revision
    expect((await call('/connector/groups', { bearer: token, body: { provider: 'telegram', revision, groups: [{ id: '-123', name: 'Selected test group' }] } })).status).toBe(200)
    await call('/connector/status', { bearer: token, body: { provider: 'telegram', revision, status: 'connected' } })
    const message = { provider: 'telegram', externalChatId: '-123', externalMessageId: '1', chatName: 'Group', sender: { id: 'tg-42', name: 'Curator' }, text: 'PRIVATE CONTENT', sentAt: '2026-09-07T09:00:00Z', replyTo: null, messageType: 'text' }
    expect((await data(await call('/connector/messages', { bearer: token, body: message }))).stored).toBe(false)
    await call('/personal/telegram/groups/-123', { cookie, method: 'PUT', body: { selected: true } })
    expect((await data(await call('/connector/messages', { bearer: token, body: { ...message, sentAt: '2026-08-29T18:59:59Z' } }))).stored).toBe(false)
    expect((await data(await call('/connector/messages', { bearer: token, body: message }))).stored).toBe(true)
    expect(JSON.stringify(await data(await call('/messages', { cookie: bob })))).not.toContain('PRIVATE CONTENT')
    await call('/personal/telegram', { cookie, method: 'DELETE' })
    expect((await data(await call('/connector/messages', { bearer: token, body: { ...message, externalMessageId: '2' } }))).stored).toBe(false)
    expect((await call('/connector/status', { bearer: token, body: { provider: 'telegram', revision, status: 'connected' } })).status).toBe(409)
    await call('/auth/connector-token', { cookie, method: 'DELETE' })
    expect((await call('/connector/config', { bearer: token })).status).toBe(401)
  })
  it('invalidates previous sessions when changing password', async () => {
    const cookie = await register('password')
    const login = await call('/auth/login', { body: { login: 'password', password: 'Long-unique-test-password!' } })
    const other = login.headers.get('set-cookie')!.split(';')[0]
    expect((await call('/auth/password', { cookie, body: { currentPassword: 'wrong', password: 'Another-long-password!' } })).status).toBe(401)
    expect((await call('/auth/password', { cookie, body: { currentPassword: 'Long-unique-test-password!', password: 'Another-long-password!' } })).status).toBe(200)
    expect((await call('/auth/me', { cookie: other })).status).toBe(401)
  })
})
