import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const origin = 'https://campus-planner.mymemory9.workers.dev'
let cookie = ''
const password = randomBytes(24).toString('hex')
const login = `qa-cloud-${Date.now()}`
async function call(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', bearer?: string) {
  const response = await fetch(`${origin}/api${path}`, { method, headers: { 'content-type': 'application/json', 'x-campus-request': '1', origin, ...(bearer ? { authorization: `Bearer ${bearer}` } : { cookie }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const nextCookie = response.headers.get('set-cookie'); if (nextCookie) cookie = nextCookie.split(';')[0]
  const result = await response.json() as any
  if (!response.ok || !result.ok) throw new Error(JSON.stringify({ path, status: response.status, error: result.error }))
  return result.data
}
const report: Record<string, unknown> = {}
try {
  await call('/auth/register', { login, password, displayName: 'Cloud smoke test' }); report.registration = true
  await call('/auth/logout', {}, 'POST'); await call('/auth/login', { login, password }); report.login = true
  const day = await call('/schedule/day?date=2026-09-07'); report.lessonCount = day.lessons.length
  const { token } = await call('/auth/connector-token', {})
  await call('/personal/telegram/connect', {})
  const config = await call('/connector/config', undefined, 'GET', token), revision = config.telegram.revision
  await call('/connector/groups', { provider: 'telegram', revision, groups: [{ id: '-qa-synthetic', name: 'Synthetic smoke test' }] }, 'POST', token)
  await call('/connector/status', { provider: 'telegram', revision, status: 'connected' }, 'POST', token)
  await call('/personal/telegram/groups/-qa-synthetic', { selected: true }, 'PUT')
  await call('/connector/messages', { provider: 'telegram', externalChatId: '-qa-synthetic', externalMessageId: '1', chatName: 'Synthetic smoke test', sender: { id: 'qa', name: 'Test sender' }, text: 'Дополнительное занятие СРС по предмету «Основы экономики и предпринимательства» 2026-09-09 с 16:00 до 17:00 в аудитории 420.', sentAt: '2026-09-07T10:00:00Z', replyTo: null, messageType: 'text' }, 'POST', token)
  const run = await call('/processing/run', {})
  for (let i = 0; i < 25; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const processing = await call('/processing')
    const current = processing.runs.find((item: any) => item.id === run.id)
    if (current?.status === 'completed' || current?.status === 'failed') {
      report.aiRun = current.status; report.aiError = current.error; report.actions = processing.actions.map((a: any) => ({ action: a.actionType, status: a.status, validationStatus: a.validationStatus, validationErrors: a.validationErrors, payload: a.payload }))
      break
    }
  }
} finally {
  try { await call('/auth/account', { password }, 'DELETE'); report.cleanup = true } catch (e) { report.cleanupError = String(e); await writeFile(fileURLToPath(new URL('./.data/cloud-qa-cleanup.json', import.meta.url)), JSON.stringify({ login, password }), { mode: 0o600 }) }
  await writeFile(fileURLToPath(new URL('../qa-artifacts/cloud-result.json', import.meta.url)), JSON.stringify(report,null,2))
  console.log(JSON.stringify(report,null,2))
}
