import { Hono } from 'hono'
import { z } from 'zod'
import { apiError, ok, validationError } from '../lib/api'
import { newId,writeAudit } from '../db/helpers'
import type { Bindings } from '../types'
const personSchema = z.object({ name: z.string().trim().min(1).max(120), nickname: z.string().trim().max(120).nullable().optional(), role: z.enum(['student', 'head', 'curator', 'teacher', 'other']), trusted: z.boolean().default(false) }).strict()
const identitySchema = z.object({ provider: z.enum(['telegram','whatsapp']), senderId: z.string().min(1).max(160) }).strict()
export const peopleRoutes = new Hono<{ Bindings: Bindings }>()
  .get('/people', async (c) => {
    const people = (await c.env.DB.prepare('SELECT * FROM people ORDER BY name').all()).results
    const identities = (await c.env.DB.prepare('SELECT provider, sender_id AS senderId, person_id AS personId FROM sender_identities').all()).results
    const senders = (await c.env.DB.prepare('SELECT provider,sender_id AS senderId,name,username,phone,last_seen_at AS lastSeenAt FROM sender_directory ORDER BY last_seen_at DESC LIMIT 1000').all()).results
    return ok(c, { people, identities, senders })
  })
  .post('/people', async (c) => {
    const parsed = personSchema.safeParse(await c.req.json())
    if (!parsed.success) return validationError(c, parsed.error)
    const id = newId('person'), p = parsed.data
    await c.env.DB.prepare('INSERT INTO people (id, name, nickname, role, trusted) VALUES (?, ?, ?, ?, ?)').bind(id, p.name, p.nickname ?? null, p.role, Number(p.trusted)).run()
    await writeAudit(c.env.DB,{actorType:'user',action:'people.created',entityType:'person',entityId:id})
    return ok(c, { id, ...p }, 201)
  })
  .patch('/people/:id', async (c) => {
    const parsed = personSchema.safeParse(await c.req.json())
    if (!parsed.success) return validationError(c, parsed.error)
    const p = parsed.data
    const result = await c.env.DB.prepare('UPDATE people SET name = ?, nickname = ?, role = ?, trusted = ? WHERE id = ? RETURNING id').bind(p.name, p.nickname ?? null, p.role, Number(p.trusted), c.req.param('id')).first()
    if(result)await writeAudit(c.env.DB,{actorType:'user',action:'people.updated',entityType:'person',entityId:c.req.param('id')})
    return result ? ok(c, result) : apiError(c, 404, 'NOT_FOUND', 'Человек не найден')
  })
  .put('/people/:id/identities', async (c) => {
    const parsed = z.array(identitySchema).max(100).safeParse(await c.req.json())
    if (!parsed.success) return validationError(c, parsed.error)
    const id = c.req.param('id')
    if (!await c.env.DB.prepare('SELECT id FROM people WHERE id = ?').bind(id).first()) return apiError(c, 404, 'NOT_FOUND', 'Человек не найден')
    for (const identity of parsed.data) {
      const linked = await c.env.DB.prepare('SELECT person_id FROM sender_identities WHERE provider = ? AND sender_id = ?').bind(identity.provider, identity.senderId).first<{ person_id: string }>()
      if (linked && linked.person_id !== id) return apiError(c, 409, 'IDENTITY_ALREADY_LINKED', 'Сначала отвяжите отправителя от другой карточки')
    }
    await c.env.DB.batch([c.env.DB.prepare('DELETE FROM sender_identities WHERE person_id = ?').bind(id), ...parsed.data.map((identity) => c.env.DB.prepare('INSERT INTO sender_identities (provider, sender_id, person_id) VALUES (?, ?, ?)').bind(identity.provider, identity.senderId, id))])
    await writeAudit(c.env.DB,{actorType:'user',action:'people.linked',entityType:'person',entityId:id})
    return ok(c, { saved: true })
  })
  .delete('/people/:id', async (c) => {
    await c.env.DB.prepare('DELETE FROM people WHERE id = ?').bind(c.req.param('id')).run()
    return ok(c, { deleted: true })
  })

peopleRoutes.post('/people/:id/merge',async c=>{
 const parsed=z.object({sourceId:z.string().min(1)}).strict().safeParse(await c.req.json());if(!parsed.success)return validationError(c,parsed.error)
 const target=c.req.param('id'),source=parsed.data.sourceId
 if(target===source)return apiError(c,400,'SAME_PERSON','Выберите другую карточку')
 const people=(await c.env.DB.prepare('SELECT id FROM people WHERE id IN (?,?)').bind(target,source).all()).results
 if(people.length!==2)return apiError(c,404,'NOT_FOUND','Карточка не найдена')
 await c.env.DB.batch([c.env.DB.prepare('UPDATE sender_identities SET person_id=? WHERE person_id=?').bind(target,source),c.env.DB.prepare('DELETE FROM people WHERE id=?').bind(source)])
 await writeAudit(c.env.DB,{actorType:'user',action:'people.linked',entityType:'person',entityId:target,metadata:{mergedFrom:source}})
 return ok(c,{merged:true})
})
