import { env } from 'cloudflare:workers'
import { expect,it } from 'vitest'
import { app } from '../app'
import { allowedProfileUrl,parseTeacherCandidates,parseTeacherProfile } from '../services/teacher-profile'
import { detectLessonType } from '../services/recurring-lesson'
async function call(path:string,body?:unknown,method='POST'){
 const r=await app.request('/api'+path,{method:body===undefined?'GET':method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})},env);return {status:r.status,...await r.json() as any}
}
it('paginates chat with stable cursor, bounded results, and no duplicates at equal timestamps',async()=>{
 await env.DB.batch(Array.from({length:45},()=>env.DB.prepare("INSERT INTO assistant_messages(id,text,context_text,state,created_at) VALUES(?,'test','test','completed','2026-09-08T10:00:00.000Z')").bind(crypto.randomUUID())))
 const first=(await call('/assistant')).data
 expect(first).toHaveLength(20)
 const second=(await call('/assistant?before='+encodeURIComponent(`${first[0].createdAt}|${first[0].id}`))).data
 expect(second).toHaveLength(20);expect(new Set([...first,...second].map(r=>r.id)).size).toBe(40)
 expect((await call('/assistant?before=bad')).status).toBe(400)
})
it('edits an applied action with a reason, retains old/new values, and allows undo after the edit',async()=>{
 const result=(await call('/assistant',{id:crypto.randomUUID(),text:'по пятницам в четные недели будет первая пара - культурология ее будет вести вроде та же учительница что и социологию и в том же кабинете'})).data
 expect(result.state).toBe('completed')
 const edit=await call(`/changes/${result.actionId}/entity`,{reason:'Уточнение преподавателя',patch:{lesson_type:'Семинар',room:'425'}},'PATCH')
 expect(edit.status,JSON.stringify(edit)).toBe(200)
 const history=(await call('/changes')).data
 const row=history.items.find(item=>item.id===result.actionId)
 expect(row.entity).toMatchObject({lesson_type:'Семинар',room:'425'})
 expect(row.edits[0].reason).toBe('Уточнение преподавателя')
 expect(JSON.parse(row.edits[0].before_json).room).toBe('420')
 expect((await call(`/actions/${result.actionId}/revert`,{})).ok).toBe(true)
 expect((await call(`/changes/${result.actionId}/entity`,{reason:'Again',patch:{room:'400'}},'PATCH')).status).toBe(409)
})
it('recognizes explicitly stated lecture or seminar without guessing the unspecified type',()=>{
 expect(detectLessonType('завтра лекция по экономике')).toBe('Лекция')
 expect(detectLessonType('семинарное занятие по культурологии')).toBe('Семинар')
 expect(detectLessonType('первая пара по культурологии')).toBeNull()
 expect(detectLessonType('лекция или семинар')).toBeNull()
})
it('matches faculty by surname and initials, blocks off-site URLs, and extracts inert text/photos',async()=>{
 const html='<h1 class="entry-title"><a href="https://person.kstu.kz/ivleva/">Ивлева Евгения Николаевна</a></h1><h1 class="entry-title"><a href="https://person.kstu.kz/other/">Ивлева Елена Петровна</a></h1>'
 expect(await parseTeacherCandidates(html,'Ивлева Е.Н.')).toEqual([{name:'Ивлева Евгения Николаевна',url:'https://person.kstu.kz/ivleva/'}])
 expect(allowedProfileUrl('https://example.com/')).toBeNull()
 expect(allowedProfileUrl('javascript:alert(1)')).toBeNull()
 const profile=await parseTeacherProfile('<h1 class="entry-title">Ивлева Евгения Николаевна</h1><div class="entry-content"><p>Преподаватель</p><img src="http://person.kstu.kz/photo.jpg"><p>Контакты</p></div>','https://person.kstu.kz/ivleva/')
 expect(profile.photo).toBe('https://person.kstu.kz/photo.jpg');expect(profile.text).toContain('Преподаватель');expect(profile.text).not.toContain('<p>')
})
it('matches Kazakh surnames and initials as complete Unicode letters',async()=>{
 const html='<h1 class="entry-title"><a href="https://person.kstu.kz/kazakh/">Әбдіқұлов Ғалым Қайратұлы</a></h1><h1 class="entry-title"><a href="https://person.kstu.kz/other/">Әбдіқұлов Нұрлан Қайратұлы</a></h1>'
 expect(await parseTeacherCandidates(html,'Әбдіқұлов Ғ.Қ.')).toEqual([{name:'Әбдіқұлов Ғалым Қайратұлы',url:'https://person.kstu.kz/kazakh/'}])
 expect(await parseTeacherCandidates(html,'Әбдіқұлов Ө.Қ.')).toEqual([])
})
it('updates lesson type directly and preserves timetable fields',async()=>{
 const id='slot-odd-1-1'
 const before=await env.DB.prepare('SELECT * FROM schedule_slots WHERE id=?').bind(id).first<any>()
 expect((await call(`/catalog/slots/${id}/type`,{lessonType:'Семинар'},'PATCH')).status).toBe(200)
 const after=await env.DB.prepare('SELECT * FROM schedule_slots WHERE id=?').bind(id).first<any>()
 expect(after).toEqual({...before,lesson_type:'Семинар'})
 expect((await call(`/catalog/slots/${id}/type`,{lessonType:'Лекция',weekday:7},'PATCH')).status).toBe(400)
 expect((await call('/catalog/slots/missing/type',{lessonType:'Лекция'},'PATCH')).status).toBe(404)
})
