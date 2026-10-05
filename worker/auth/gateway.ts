import {accountFeatures,requiredFeature} from '../permissions'
import {groupRoutes,membership} from '../groups/routes'
import {supportRoutes} from '../support'
import {adminRoutes} from '../admin'
import {activityRoutes} from '../activity'
import {recordEvent} from '../analytics'
import {groupForward} from '../groups/forward'
import { Hono } from 'hono'
import { z } from 'zod'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { digest, hashPassword, randomToken, verifyPassword } from './crypto'
import { apiError, ok, validationError } from '../lib/api'
import type { Bindings } from '../types'

type User = { id: string; login: string; displayName: string }
const credentials = z.object({ login: z.string().trim().toLowerCase().regex(/^[a-z0-9_.-]{3,60}$/), password: z.string().min(4).max(256), displayName: z.string().trim().min(1).max(100).optional() })
export const gateway = new Hono<{ Bindings: Bindings; Variables: { user: User } }>()

gateway.use('*', async (c, next) => {
  c.header('cache-control', 'no-store')
  c.header('x-content-type-options', 'nosniff')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && !c.req.header('authorization')) {
    const origin = c.req.header('origin')
    if (c.req.header('x-campus-request') !== '1' || (origin && origin !== new URL(c.req.url).origin && origin !== c.env.PUBLIC_APP_URL)) return apiError(c, 403, 'CSRF_REJECTED', 'Запрос отклонён. Обновите страницу.')
  }
  await next()
})

async function createSession(c: Parameters<typeof setCookie>[0], db: D1Database, id: string) {
  const token = randomToken()
  await db.prepare('INSERT INTO account_sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)').bind(await digest(token), id, Date.now() + 30 * 86400000).run()
  setCookie(c, 'campus_session', token, { httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Strict', path: '/', maxAge: 30 * 86400 })
  c.executionCtx.waitUntil(recordEvent(c.env as Bindings,id,c.req.path.endsWith('/register')?'account.register':'account.login','auth',c.req.header('user-agent')??'').catch(()=>{}))
}

gateway.post('/api/auth/:operation{register|login}', async (c) => {
  const parsed = credentials.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return validationError(c, parsed.error)
  const networkKey = await digest(`network:${c.req.header('cf-connecting-ip') ?? 'local'}`)
  const network = await c.env.DB.prepare(`INSERT INTO auth_attempts (key, count, reset_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = CASE WHEN reset_at < ? THEN 1 ELSE count + 1 END,
      reset_at = CASE WHEN reset_at < ? THEN excluded.reset_at ELSE reset_at END RETURNING count`)
    .bind(networkKey, Date.now() + 600000, Date.now(), Date.now()).first<{ count: number }>()
  if ((network?.count ?? 601) > 600) return apiError(c, 429, 'RATE_LIMITED', 'Слишком много попыток. Повторите через 10 минут.')
  const key = await digest(`${c.req.header('cf-connecting-ip') ?? 'local'}:${parsed.data.login}`)
  const attempt = await c.env.DB.prepare(`INSERT INTO auth_attempts (key, count, reset_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = CASE WHEN reset_at < ? THEN 1 ELSE count + 1 END,
      reset_at = CASE WHEN reset_at < ? THEN excluded.reset_at ELSE reset_at END RETURNING count`)
    .bind(key, Date.now() + 600000, Date.now(), Date.now()).first<{ count: number }>()
  if ((attempt?.count ?? 99) > 10) return apiError(c, 429, 'RATE_LIMITED', 'Слишком много попыток. Повторите через 10 минут.')
  if (c.req.param('operation') === 'register') {
    const id = crypto.randomUUID()
    const user = { id, login: parsed.data.login, displayName: parsed.data.displayName ?? parsed.data.login }
    const existing = await c.env.DB.prepare('SELECT id FROM accounts WHERE login = ?').bind(user.login).first()
    if (existing) return apiError(c, 409, 'LOGIN_UNAVAILABLE', 'Этот логин уже занят')
    await c.env.DB.prepare('INSERT INTO accounts (id, login, display_name, password_hash) VALUES (?, ?, ?, ?)').bind(id, user.login, user.displayName, await hashPassword(parsed.data.password)).run()
    await c.env.DB.prepare('INSERT INTO account_onboarding(account_id,completed) VALUES(?,0)').bind(id).run()
    await c.env.WORKSPACES.get(c.env.WORKSPACES.idFromName(id)).fetch('https://workspace/internal/initialize-empty',{method:'POST',headers:{'x-campus-owner':id}})
    await createSession(c, c.env.DB, id)
    return ok(c, user, 201)
  }
  const row = await c.env.DB.prepare('SELECT id, login, display_name, password_hash FROM accounts WHERE deleting=0 AND login = ?').bind(parsed.data.login).first<{ id: string; login: string; display_name: string; password_hash: string }>()
  const valid = await verifyPassword(parsed.data.password, row?.password_hash ?? `${'0'.repeat(64)}:${'0'.repeat(64)}`)
  if (!row || !valid) return apiError(c, 401, 'INVALID_CREDENTIALS', 'Неверный логин или пароль')
  await createSession(c, c.env.DB, row.id)
  return ok(c, { id: row.id, login: row.login, displayName: row.display_name,isAdmin:!!c.env.ADMIN_ACCOUNT_ID&&row.id===c.env.ADMIN_ACCOUNT_ID,features:await accountFeatures(c.env,row.id) })
})

gateway.use('/api/*', async (c, next) => {
  const bearer = c.req.header('authorization')?.replace(/^Bearer /, '')
  let user: User | null = null
  if (bearer) {
    // Connector credentials never authorize schedule, files, people or account administration.
    if (!c.req.path.startsWith('/api/connector/')) return apiError(c, 403, 'TOKEN_SCOPE', 'Ключ предназначен только для подключения мессенджеров')
    user = await c.env.DB.prepare(`SELECT a.id, a.login, a.display_name AS displayName FROM accounts a JOIN account_connectors t ON t.account_id = a.id WHERE a.deleting=0 AND t.token_hash = ? AND t.expires_at > ?`).bind(await digest(bearer), Date.now()).first<User>()
  } else {
    const token = getCookie(c, 'campus_session')
    if (token) user = await c.env.DB.prepare(`SELECT a.id, a.login, a.display_name AS displayName FROM accounts a JOIN account_sessions s ON s.account_id = a.id WHERE a.deleting=0 AND s.token_hash = ? AND s.expires_at > ?`).bind(await digest(token), Date.now()).first<User>()
  }
  if (!user) return apiError(c, 401, 'AUTH_REQUIRED', 'Войдите в аккаунт')
  c.set('user', user)
  await next()
})
gateway.use('/api/*',async(c,next)=>{const feature=requiredFeature(c.req.path);if(feature&&!(await accountFeatures(c.env,c.get('user').id)).includes(feature))return apiError(c,403,'FEATURE_PREVIEW','Доступ к этому разделу пока не выдан.');await next()})
gateway.route('/',groupRoutes)
gateway.route('/',supportRoutes)
gateway.route('/',adminRoutes)
gateway.route('/',activityRoutes)
gateway.get('/api/auth/me', async (c) => ok(c, {...c.get('user'),isAdmin:!!c.env.ADMIN_ACCOUNT_ID&&c.get('user').id===c.env.ADMIN_ACCOUNT_ID,features:await accountFeatures(c.env,c.get('user').id)}))
gateway.post('/api/auth/logout', async (c) => {
  await c.env.DB.prepare('DELETE FROM account_sessions WHERE token_hash = ?').bind(await digest(getCookie(c, 'campus_session') ?? '')).run()
  deleteCookie(c, 'campus_session', { path: '/' })
  return ok(c, { loggedOut: true })
})
gateway.post('/api/auth/password', async (c) => {
  const parsed = z.object({ currentPassword: z.string().max(256), password: z.string().min(4).max(256) }).safeParse(await c.req.json())
  if (!parsed.success) return validationError(c, parsed.error)
  const row = await c.env.DB.prepare('SELECT password_hash FROM accounts WHERE id = ?').bind(c.get('user').id).first<{ password_hash: string }>()
  if (!row || !await verifyPassword(parsed.data.currentPassword, row.password_hash)) return apiError(c, 401, 'INVALID_CREDENTIALS', 'Неверный текущий пароль')
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE accounts SET password_hash = ? WHERE id = ?').bind(await hashPassword(parsed.data.password), c.get('user').id),
    c.env.DB.prepare('DELETE FROM account_sessions WHERE account_id = ?').bind(c.get('user').id),
  ])
  await createSession(c, c.env.DB, c.get('user').id)
  return ok(c, { changed: true })
})
gateway.post('/api/auth/connector-token', async (c) => {
  const token = randomToken()
  await c.env.DB.prepare('INSERT INTO account_connectors (token_hash, account_id, name, expires_at) VALUES (?, ?, ?, ?)').bind(await digest(token), c.get('user').id, 'Личное устройство', Date.now() + 30 * 86400000).run()
  return ok(c, { token, expiresInDays: 30 }, 201)
})
gateway.delete('/api/auth/connector-token', async (c) => {
  await c.env.DB.prepare('DELETE FROM account_connectors WHERE account_id = ?').bind(c.get('user').id).run()
  return ok(c, { revoked: true })
})
gateway.delete('/api/auth/account', async (c) => {
  const parsed = z.object({ password: z.string().max(256) }).safeParse(await c.req.json())
  if (!parsed.success) return validationError(c, parsed.error)
  const user = c.get('user')
  if((await membership(c.env.DB,user.id))?.role==='owner')return apiError(c,409,'TRANSFER_REQUIRED','Передайте владение группой перед удалением аккаунта.')
  const account = await c.env.DB.prepare('SELECT password_hash FROM accounts WHERE id = ?').bind(user.id).first<{ password_hash: string }>()
  if (!account || !await verifyPassword(parsed.data.password, account.password_hash)) return apiError(c, 401, 'INVALID_CREDENTIALS', 'Неверный пароль')
  const response = await c.env.WORKSPACES.get(c.env.WORKSPACES.idFromName(user.id)).fetch('https://workspace/internal/delete', { method: 'DELETE', headers: { 'x-campus-owner': user.id } })
  if (!response.ok) return apiError(c, 500, 'DELETE_FAILED', 'Не удалось удалить рабочее пространство')
  await c.env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(user.id).run()
  deleteCookie(c, 'campus_session', { path: '/' })
  return ok(c, { deleted: true })
})
gateway.all('/api/*', async (c) => {
  // Legacy bot/mock integrations are deliberately not exposed by the public gateway.
  if (/^\/api\/(?:integrations\/(?:telegram|whatsapp)|webhooks|bridges)/.test(c.req.path)) return apiError(c, 410, 'USE_PERSONAL_CONNECTION', 'Используйте личное подключение в настройках')
  const user = c.get('user')
  const canGroup=(await accountFeatures(c.env,user.id)).includes('groups'),requestedScope=c.req.header('x-campus-scope')??c.req.query('campus_scope')
  if(!canGroup&&requestedScope&&requestedScope!=='personal')return apiError(c,403,'FEATURE_PREVIEW','Доступ к группам не выдан. Откройте личное расписание.')
  let ctx:{waitUntil(promise:Promise<unknown>):void}|undefined;try{ctx=c.executionCtx}catch{/* Tests without an execution context notify inline. */}
  const grouped=canGroup?await groupForward(c.req.raw,c.env,user.id,ctx):null
  if(grouped)return grouped
  const headers = new Headers(c.req.raw.headers)
  headers.set('x-campus-owner', user.id)
  headers.delete('cookie')
  headers.delete('authorization')
  return c.env.WORKSPACES.get(c.env.WORKSPACES.idFromName(user.id)).fetch(new Request(c.req.raw, { headers }))
})
gateway.onError((error, c) => {
  if (error.message.includes('UNIQUE constraint')) return apiError(c, 409, 'CONFLICT', 'Такая запись уже существует')
  console.error('Account gateway request failed')
  return apiError(c, 500, 'INTERNAL_ERROR', 'Не удалось выполнить запрос')
})
