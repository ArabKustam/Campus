import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { createAiRun, processAiRun, type StructuredAiRequest } from '../services/processing'

let sequence = 0

async function seedMessages(count: number) {
  const prefix = `resilience-${sequence++}`
  const sourceId = `source-${prefix}`
  await env.DB.prepare(`
    INSERT INTO message_sources (id, integration_id, provider, external_chat_id, name, source_type, is_enabled)
    VALUES (?, 'integration-telegram', 'telegram', ?, 'Resilience test', 'group', 1)
  `).bind(sourceId, prefix).run()

  const ids: string[] = []
  for (let index = 0; index < count; index += 1) {
    const id = `${prefix}-message-${index}`
    ids.push(id)
    await env.DB.prepare(`
      INSERT INTO messages (id, source_id, provider, external_message_id, sender_json, text, sent_at, message_type)
      VALUES (?, ?, 'telegram', ?, '{}', 'Test message', ?, 'text')
    `).bind(id, sourceId, String(index), `2099-01-01T00:${String(index).padStart(2, '0')}:00.000Z`).run()
  }
  return ids
}

function unknownActions(request: StructuredAiRequest) {
  return request.contexts.map(({ currentMessage }) => ({
    messageId: currentMessage.id,
    action: 'UNKNOWN' as const,
    subjectId: null,
    targetDate: null,
    targetLessonId: null,
    content: null,
    confidence: 0,
    reason: 'Test fallback.',
  }))
}

describe('AI processing resilience', () => {
  it('does not let a duplicate invocation finish an already-running run', async () => {
    const [messageId] = await seedMessages(1)
    let releaseRunner!: () => void
    let notifyStarted!: () => void
    const runnerStarted = new Promise<void>((resolve) => { notifyStarted = resolve })
    const runnerReleased = new Promise<void>((resolve) => { releaseRunner = resolve })
    let calls = 0
    const runner = async (request: StructuredAiRequest) => {
      calls += 1
      notifyStarted()
      await runnerReleased
      return { actions: unknownActions(request) }
    }

    const run = await createAiRun(env, 'manual')
    const firstInvocation = processAiRun(env, run.id, runner)
    await runnerStarted
    await processAiRun(env, run.id, runner)

    const whileBlocked = await env.DB.prepare('SELECT status, completed_at FROM ai_runs WHERE id = ?').bind(run.id).first<Record<string, unknown>>()
    expect(whileBlocked).toMatchObject({ status: 'running', completed_at: null })
    expect(calls).toBe(1)

    releaseRunner()
    await firstInvocation
    expect(await env.DB.prepare('SELECT processing_status FROM messages WHERE id = ?').bind(messageId).first()).toMatchObject({ processing_status: 'processed' })
  })

  it('reclaims stale ISO-8601 processing timestamps', async () => {
    const [messageId] = await seedMessages(1)
    await env.DB.prepare(`
      UPDATE messages
      SET processing_status = 'processing', processing_run_id = 'abandoned-run',
        processing_started_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-20 minutes')
      WHERE id = ?
    `).bind(messageId).run()

    const run = await createAiRun(env, 'manual')
    await processAiRun(env, run.id, async (request) => ({ actions: unknownActions(request) }))

    expect(await env.DB.prepare('SELECT processing_status, processing_run_id FROM messages WHERE id = ?').bind(messageId).first()).toMatchObject({
      processing_status: 'processed',
      processing_run_id: run.id,
    })
  })

  it('replays a partially failed batch without duplicating stored actions', async () => {
    const [firstMessageId, secondMessageId] = await seedMessages(2)
    await env.DB.prepare(`
      CREATE TRIGGER fail_second_resilience_action
      BEFORE INSERT ON ai_actions WHEN NEW.message_id = '${secondMessageId}'
      BEGIN SELECT RAISE(FAIL, 'simulated partial failure'); END
    `).run()

    const runner = async (request: StructuredAiRequest) => ({ actions: unknownActions(request) })
    const failedRun = await createAiRun(env, 'manual')
    await processAiRun(env, failedRun.id, runner)
    expect(await env.DB.prepare('SELECT status FROM ai_runs WHERE id = ?').bind(failedRun.id).first()).toMatchObject({ status: 'failed' })
    expect((await env.DB.prepare('SELECT id FROM ai_actions WHERE message_id IN (?, ?)').bind(firstMessageId, secondMessageId).all()).results).toHaveLength(1)

    await env.DB.prepare('DROP TRIGGER fail_second_resilience_action').run()
    const replayRun = await createAiRun(env, 'manual')
    await processAiRun(env, replayRun.id, runner)

    const actions = (await env.DB.prepare('SELECT message_id FROM ai_actions WHERE message_id IN (?, ?) ORDER BY message_id').bind(firstMessageId, secondMessageId).all()).results
    expect(actions).toEqual([{ message_id: firstMessageId }, { message_id: secondMessageId }])
    expect(await env.DB.prepare('SELECT status, messages_scanned, actions_created FROM ai_runs WHERE id = ?').bind(replayRun.id).first()).toMatchObject({
      status: 'completed',
      messages_scanned: 2,
      actions_created: 1,
    })
  })

  it('accepts the structured response object returned by Workers AI JSON mode', async () => {
    await seedMessages(1)
    const run = await createAiRun(env, 'manual')
    await processAiRun(env, run.id, async (request) => ({ response: { actions: unknownActions(request) } }))

    expect(await env.DB.prepare('SELECT status, error FROM ai_runs WHERE id = ?').bind(run.id).first()).toMatchObject({ status: 'completed', error: null })
  })

  it('auto-applies at the confidence threshold but not below it', async () => {
    const [equalMessageId, lowMessageId] = await seedMessages(2)
    for (const id of [equalMessageId, lowMessageId]) await env.DB.prepare('UPDATE messages SET text = ? WHERE id = ?').bind('По программированию сделать лабораторную 4 к следующей паре', id).run()
    await env.DB.prepare("UPDATE settings SET value_json = ? WHERE key = 'automation'").bind(JSON.stringify({
      enabled: true,
      minimumConfidence: 0.92,
      previousMessages: 0,
      nextMessages: 0,
      autoApply: { homework: true },
    })).run()
    const run = await createAiRun(env, 'manual')
    await processAiRun(env, run.id, async () => ({
      actions: [
        { messageId: equalMessageId, action: 'ADD_HOMEWORK', subjectId: 'subject-programming', targetDate: '2026-09-09', targetLessonId: 'slot-even-3-2', content: 'At threshold', confidence: 0.92, reason: 'Boundary test.' },
        { messageId: lowMessageId, action: 'ADD_HOMEWORK', subjectId: 'subject-programming', targetDate: '2026-09-09', targetLessonId: 'slot-even-3-2', content: 'Below threshold', confidence: 0.919, reason: 'Boundary test.' },
      ],
    }))

    expect(await env.DB.prepare('SELECT status FROM ai_actions WHERE message_id = ?').bind(equalMessageId).first()).toMatchObject({ status: 'applied' })
    expect(await env.DB.prepare('SELECT status FROM ai_actions WHERE message_id = ?').bind(lowMessageId).first()).toMatchObject({ status: 'suggested' })
  })
})
