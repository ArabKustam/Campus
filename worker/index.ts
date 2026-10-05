import { gateway } from './auth/gateway'
import {deliverSupport,supportWebhook} from './support'
import type { Bindings } from './types'
export { Workspace } from './workspace/object'
export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    const path = new URL(request.url).pathname
    if(path==='/api/support/telegram-webhook')return supportWebhook(request,env,ctx)
    if (path === '/health') return Response.json({ ok: true, data: { service: 'campus-worker' } })
    if (path.startsWith('/api/')) return gateway.fetch(request, env, ctx)
    const asset=await env.ASSETS.fetch(request)
    if(asset.headers.get('content-type')?.includes('text/html')){const headers=new Headers(asset.headers);headers.set('cache-control','no-cache, must-revalidate');return new Response(asset.body,{status:asset.status,headers})}
    return asset
  },
  async scheduled(_controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      await deliverSupport(env)
      await env.DB.batch([
        env.DB.prepare('DELETE FROM account_sessions WHERE expires_at < ?').bind(Date.now()),
        env.DB.prepare('DELETE FROM account_connectors WHERE expires_at < ?').bind(Date.now()),
        env.DB.prepare('DELETE FROM auth_attempts WHERE reset_at < ?').bind(Date.now()),
        env.DB.prepare('DELETE FROM account_events WHERE created_at < ?').bind(Date.now()-90*86400000),
        env.DB.prepare('DELETE FROM activity_intervals WHERE ended_at < ?').bind(Date.now()-90*86400000),
      ])
      let cursor = ''
      while (true) {
        const users = await env.DB.prepare('SELECT id FROM accounts WHERE id > ? ORDER BY id LIMIT 20').bind(cursor).all<{ id: string }>()
        if (!users.results.length) break
        await Promise.all(users.results.map(({ id }) => env.WORKSPACES.get(env.WORKSPACES.idFromName(id)).fetch('https://workspace/internal/process', { headers: { 'x-campus-owner': id } })))
        cursor = users.results.at(-1)!.id
      }
    })())
  },
} satisfies ExportedHandler<Bindings>
