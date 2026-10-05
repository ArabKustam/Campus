import type { Bindings } from '../types'
export async function runMeteredAi(env: Bindings, purpose: string, input: unknown, model = env.AI_MODEL) {
  const id = crypto.randomUUID(), start = Date.now()
  // Per-workspace guard; Cloudflare's shared account quota is separate.
  const reserved = await env.DB.prepare(`INSERT INTO ai_usage(id,purpose,model)
    SELECT ?,?,? WHERE (SELECT count(*) FROM ai_usage WHERE created_at >= strftime('%Y-%m-%dT00:00:00.000Z','now')) < 100`).bind(id,purpose,model).run()
  if (!reserved.meta.changes) throw new Error('Достигнут защитный лимит: 100 запросов AI в сутки для вашего аккаунта. Сброс в 00:00 UTC.')
  try {
    const result = await (env.AI as unknown as { run(model:string,input:unknown):Promise<unknown> }).run(model,input)
    const usage = (result as {usage?:{prompt_tokens?:number;completion_tokens?:number}})?.usage
    await env.DB.prepare("UPDATE ai_usage SET status='completed',input_tokens=?,output_tokens=?,duration_ms=? WHERE id=?").bind(usage?.prompt_tokens ?? null,usage?.completion_tokens ?? null,Date.now()-start,id).run()
    return result
  } catch (error) {
    await env.DB.prepare("UPDATE ai_usage SET status='failed',error=?,duration_ms=? WHERE id=?").bind(error instanceof Error ? error.message.slice(0,500) : 'Ошибка AI',Date.now()-start,id).run()
    throw error
  }
}
