import {env} from 'cloudflare:workers'
import {createExecutionContext,waitOnExecutionContext} from 'cloudflare:test'
import {it,expect} from 'vitest'
import worker from '../index'
import {diffPlatonusSchedule,diffGroupSchedule,notifyPlatonusChanges,localToday,tolerate} from '../services/schedule-notifications'
import type {Bindings} from '../types'
async function call(path:string,cookie='',body?:unknown,scope='personal',method=body===undefined?'GET':'POST'){
 const ctx=createExecutionContext(),r=await worker.fetch(new Request('https://campus.test/api'+path,{method,headers:{cookie,origin:'https://campus.test','x-campus-request':'1','x-campus-scope':scope,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,ctx);await waitOnExecutionContext(ctx);return r
}
async function data(r:Response){const json=await r.json() as any;expect(json.ok,JSON.stringify(json)).toBe(true);return json.data}
async function user(login:string){const r=await call('/auth/register','',{login,password:'schedule-test-password-long'});expect(r.status,await r.clone().text()).toBe(201);const id=(await r.clone().json() as any).data.id;await env.DB.prepare('INSERT INTO account_permissions VALUES(?,?)').bind(id,JSON.stringify(['ai','groups','messengers','tasks'])).run();return {cookie:r.headers.get('set-cookie')!.split(';')[0],id:id as string}}
const empty={tables:[],links:[],error:null}
const lesson=(over:Record<string,unknown>={})=>({subject:'Экономика',teacher:'Иванов И.И.',lessonType:'Лекция',building:'Корпус 1',room:'305',weekday:2,slotNumber:2,startTime:'10:55',endTime:'12:40',weekNumber:5,...over})
const snapshot=(lessons:Record<string,unknown>[])=>({capturedAt:new Date().toISOString(),semesterStart:'2026-09-01',semesterEnd:'2026-12-31',weeks:[5,6],lessons,grades:empty,umkd:empty})
const weekly=(over:Record<string,unknown>={})=>[lesson(over),lesson({...over,weekNumber:6})]
const inbox=async(cookie:string,query='')=>data(await call('/notifications'+query,cookie))

it('diffs Platonus snapshots: weekly teacher change, single-week additions, semester switch is silent',()=>{
 const before=snapshot(weekly()) as any,after=snapshot(weekly({teacher:'Петрова А.А.'})) as any
 const changes=diffPlatonusSchedule(before,after,'2026-10-01')
 expect(changes).toHaveLength(1);expect(changes[0]).toMatchObject({kind:'teacher',subject:'Экономика',from:'Иванов И.И.',to:'Петрова А.А.',weekday:2,slot:2,date:'2026-10-06'})
 const added=diffPlatonusSchedule(before,snapshot([...weekly(),lesson({subject:'Физика',slotNumber:3,startTime:'13:10',endTime:'14:55',weekNumber:6})]) as any,'2026-10-01')
 expect(added).toEqual([expect.objectContaining({kind:'added',subject:'Физика'})])
 expect(diffPlatonusSchedule(before,{...after,semesterStart:'2027-01-20',semesterEnd:'2027-05-30'},'2026-10-01')).toEqual([])
 expect(diffPlatonusSchedule(before,snapshot([]) as any,'2026-10-01')).toEqual([])
})

it('notifies Platonus changes once, never for the first snapshot, and summarizes many changes',async()=>{
 const alice=await user('sched-platonus'),bob=await user('sched-platonus-bob')
 await data(await call('/connector/platonus/snapshot',alice.cookie,snapshot(weekly())))
 expect((await inbox(alice.cookie,'?type=schedule')).items).toHaveLength(0)
 await data(await call('/connector/platonus/snapshot',alice.cookie,snapshot(weekly({teacher:'Петрова А.А.'}))))
 let list=await inbox(alice.cookie,'?type=schedule')
 expect(list.items).toHaveLength(1);expect(list.items[0]).toMatchObject({type:'schedule',kind:'teacher',subject:'Экономика',read_at:null});expect(list.items[0].body).toContain('Иванов И.И. → Петрова А.А.');expect(list.unreadByType.schedule).toBe(1)
 // Repeating a diff (e.g. a flapping sync) is deduplicated by the deterministic id.
 const scoped={...env,REGISTRY:env.DB,OWNER_ID:alice.id} as unknown as Bindings
 expect(await notifyPlatonusChanges(scoped,snapshot(weekly()) as any,snapshot(weekly({teacher:'Петрова А.А.'})) as any)).toBe(0)
 expect(await notifyPlatonusChanges(scoped,null,snapshot(weekly()) as any)).toBe(0)
 const many=[1,2,3,4,5,6,7].map(slot=>lesson({subject:'Предмет '+slot,slotNumber:slot,startTime:`0${slot}:00`.slice(-5),endTime:`0${slot}:50`.slice(-5),weekday:4}))
 await data(await call('/connector/platonus/snapshot',alice.cookie,snapshot([...weekly({teacher:'Петрова А.А.'}),...many])))
 list=await inbox(alice.cookie,'?type=schedule')
 expect(list.items).toHaveLength(2);expect(list.items[0]).toMatchObject({kind:'platonus_update',title:'В Platonus изменилось расписание'});expect(list.items[0].payload.changes).toHaveLength(7);expect(list.items[0].body).toContain('7 изменений')
 expect((await inbox(bob.cookie)).items).toHaveLength(0)
 // Owner isolation: someone else cannot read or delete these notifications.
 await data(await call('/notifications/read',bob.cookie,{ids:[list.items[0].id]}))
 expect((await inbox(alice.cookie,'?unread=1')).items.map((i:any)=>i.id)).toContain(list.items[0].id)
 expect((await call('/notifications/'+encodeURIComponent(list.items[0].id),bob.cookie,undefined,'personal','DELETE')).status).toBe(404)
 // Filtering, read, delete and clearing read ones.
 expect((await inbox(alice.cookie,'?type=grade')).items).toHaveLength(0)
 await data(await call('/notifications/read',alice.cookie,{ids:[list.items[1].id]}))
 list=await inbox(alice.cookie,'?type=schedule');expect(list.unreadByType.schedule).toBe(1);expect(list.items[1].read_at).toBeGreaterThan(0)
 await data(await call('/notifications/'+encodeURIComponent(list.items[0].id),alice.cookie,undefined,'personal','DELETE'))
 expect((await inbox(alice.cookie,'?type=schedule')).items).toHaveLength(1)
 expect((await data(await call('/notifications?scope=read',alice.cookie,undefined,'personal','DELETE'))).removed).toBe(1)
 expect((await inbox(alice.cookie,'?type=schedule')).items).toHaveLength(0)
 await data(await call('/connector/platonus/snapshot',alice.cookie,snapshot([...weekly({teacher:'Сидоров С.С.'}),...many])))
 expect((await inbox(alice.cookie)).unreadByType.schedule).toBe(1)
 await data(await call('/notifications/read',alice.cookie,{all:true}))
 expect((await inbox(alice.cookie)).unread).toBe(0)
})

it('diffs group lesson overrides: cancel, move, room and restoring',()=>{
 const slot={id:'s1',subjectName:'Экономика',teacherName:null,weekday:2,slotNumber:2,startTime:'10:55',endTime:'12:40',weekType:'both' as const,lessonType:'Лекция',building:null,room:'305'}
 const base={id:'o1',scheduleSlotId:'s1',lessonDate:'2026-10-06',status:'normal',movedDate:null,movedStartTime:null,building:null,room:null}
 const state=(overrides:any[])=>({slots:[slot],overrides})
 expect(diffGroupSchedule(state([]),state([{...base,status:'cancelled'}]),'2026-10-01')).toEqual([expect.objectContaining({kind:'cancelled',date:'2026-10-06',slot:2})])
 expect(diffGroupSchedule(state([]),state([{...base,status:'moved',movedDate:'2026-10-08',movedStartTime:'13:10'}]),'2026-10-01')[0]).toMatchObject({kind:'moved',from:'6 окт 10:55',to:'8 окт 13:10'})
 expect(diffGroupSchedule(state([]),state([{...base,room:'412'}]),'2026-10-01')[0]).toMatchObject({kind:'room',from:'305',to:'412'})
 expect(diffGroupSchedule(state([{...base,status:'cancelled'}]),state([]),'2026-10-01')[0]).toMatchObject({kind:'restored'})
 expect(diffGroupSchedule(state([]),state([{...base,lessonDate:'2026-09-01',status:'cancelled'}]),'2026-10-01')).toEqual([])
})

it('notifies affected group members except the actor and respects subgroup scope',async()=>{
 const owner=await user('sched-owner'),a=await user('sched-member-a'),b=await user('sched-member-b')
 await data(await call('/groups',owner.cookie,{name:'Группа уведомлений'}))
 for(const member of [a,b]){const invite=await data(await call('/groups/admin/invite',owner.cookie,{}));await data(await call('/groups/join',member.cookie,{token:new URL(invite.url).searchParams.get('invite')}))}
 const group=await data(await call('/groups',owner.cookie)),[subA,subB]=group.subgroups.map((s:any)=>s.id)
 await data(await call('/groups/admin/members/'+a.id,owner.cookie,{role:'member',subgroupId:subA},'personal','PATCH'))
 await data(await call('/groups/admin/members/'+b.id,owner.cookie,{role:'member',subgroupId:subB},'personal','PATCH'))
 const course=await data(await call('/catalog/subjects',owner.cookie,{name:'Экономика',shortName:null,color:'#2563eb'},'common'))
 const slot=await data(await call('/catalog/slots',owner.cookie,{subjectId:course.id,teacherId:null,weekday:2,slotNumber:2,startTime:'10:55',endTime:'12:40',weekType:'both',lessonType:'Лекция',building:null,room:'305'},'common'))
 for(const member of [a,b])expect((await inbox(member.cookie,'?type=schedule')).items.map((i:any)=>i.kind)).toEqual(['added'])
 const date=new Date(`${localToday()}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+7);const lessonDate=date.toISOString().slice(0,10)
 await data(await call('/lesson-overrides',owner.cookie,{scheduleSlotId:slot.id,lessonDate,status:'cancelled'},'common'))
 for(const member of [a,b]){const list=await inbox(member.cookie,'?type=schedule');expect(list.items[0]).toMatchObject({kind:'cancelled',subject:'Экономика',lesson_date:lessonDate,actor:'Староста sched-owner'});expect(list.items[0].body).toMatch(/^Староста sched-owner: Экономика \d+ \S+, 2 пара — отменена$/)}
 expect((await inbox(owner.cookie,'?type=schedule')).items).toHaveLength(0)
 // A subgroup-only lesson notifies only that subgroup.
 const subCourse=await data(await call('/catalog/subjects',owner.cookie,{name:'Экономика',shortName:null,color:'#2563eb'},subA))
 const seminar=await data(await call('/catalog/slots',owner.cookie,{subjectId:subCourse.id,teacherId:null,weekday:3,slotNumber:1,startTime:'09:00',endTime:'10:45',weekType:'both',lessonType:'Семинар',building:null,room:'101'},subA))
 await data(await call('/lesson-overrides',owner.cookie,{scheduleSlotId:seminar.id,lessonDate,room:'412'},subA))
 expect((await inbox(a.cookie,'?type=schedule')).items.map((i:any)=>i.kind)).toEqual(['room','added','cancelled','added'])
 expect((await inbox(b.cookie,'?type=schedule')).items.map((i:any)=>i.kind)).toEqual(['cancelled','added'])
 // Notes alone are not a schedule change (PATCH resets an omitted status to normal, so the status is sent again).
 const override=(await data(await call(`/schedule?from=${lessonDate}&to=${lessonDate}`,owner.cookie,undefined,'common'))).overrides[0]
 await data(await call('/lesson-overrides/'+override.id,owner.cookie,{status:'cancelled',note:'Аудитория уточняется'},'common','PATCH'))
 expect((await inbox(b.cookie,'?type=schedule')).items).toHaveLength(2)
})

it('tolerates the schedule table missing before its migration is applied',async()=>{
 expect(await tolerate(()=>Promise.reject(new Error('D1_ERROR: no such table: schedule_notifications: SQLITE_ERROR')),7)).toBe(7)
 await expect(tolerate(()=>Promise.reject(new Error('disk I/O error')),7)).rejects.toThrow('disk')
})
