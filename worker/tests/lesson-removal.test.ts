import {env} from 'cloudflare:workers'
import {expect,it} from 'vitest'
import {app} from '../app'
import {buildProcessingContexts,referencedDates} from '../services/processing-context'
import {resolveDirectCancellation} from '../services/direct-cancellation'
async function call(path:string,method='GET',body?:unknown){return app.request('https://campus.test/api'+path,{method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined},env)}
it('removes and restores a lesson without destroying its history',async()=>{
 const res=await call('/catalog/slots/slot-odd-1-1','DELETE');expect(res.status).toBe(200);const {data}=await res.json() as any
 expect((await env.DB.prepare("SELECT is_active FROM schedule_slots WHERE id='slot-odd-1-1'").first<any>())?.is_active).toBe(0)
 expect((await call(`/catalog/removals/${data.id}/restore`,'POST')).status).toBe(200)
 expect((await env.DB.prepare("SELECT is_active FROM schedule_slots WHERE id='slot-odd-1-1'").first<any>())?.is_active).toBe(1)
 expect((await call(`/catalog/removals/${data.id}/restore`,'POST')).status).toBe(404)
})
it('does not overwrite a replacement lesson when restoring',async()=>{
 const res=await call('/catalog/slots/slot-even-1-1','DELETE'),{data}=await res.json() as any
 await env.DB.prepare("INSERT INTO schedule_slots(id,subject_id,weekday,slot_number,start_time,end_time,week_type) SELECT 'replacement',subject_id,weekday,slot_number,start_time,end_time,week_type FROM schedule_slots WHERE id='slot-even-1-1'").run()
 expect((await call(`/catalog/removals/${data.id}/restore`,'POST')).status).toBe(409)
})
it('deletes an unambiguous regular lesson through AI without invoking a model',async()=>{
 const res=await call('/assistant','POST',{id:crypto.randomUUID(),text:'удали из расписания экономику по четвергам знаменатель'}),body=await res.json() as any
 expect(body.data.state,JSON.stringify(body)).toBe('completed');expect(body.data.reply).toContain('Удалено из регулярного')
})
it('resolves the users actual future Friday cancellation against real occurrences',async()=>{
 const text='отмени пару по физкультуре в пятницу но через 2 недели'
 const [context]=await buildProcessingContexts(env.DB,[{id:'future-request',source_id:'manual-assistant',external_message_id:'future-request',sender_json:'{}',text,sent_at:'2026-09-17T06:00:00Z',reply_to_json:null,provider:'manual'}],{timezone:'Asia/Almaty',previousCount:0,nextCount:0})
 expect(resolveDirectCancellation(context)?.proposal).toMatchObject({targetDate:'2026-10-02',targetLessonId:'slot-odd-5-2'})
 expect(referencedDates('в пятницу через три дня','2026-09-17')).toEqual([])
 expect(referencedDates('в пятницу через месяц','2026-09-17')).toEqual([])
})
