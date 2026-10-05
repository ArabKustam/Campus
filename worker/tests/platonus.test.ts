import {env} from 'cloudflare:workers'
import {it,expect,beforeEach} from 'vitest'
import {app} from '../app'
import {parseLesson,semesterDates} from '../../bridge/platonus-parser'
async function call(path:string,body?:unknown){const r=await app.request('/api'+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})},env);return {status:r.status,...await r.json() as any}}
beforeEach(async()=>{await env.DB.batch([env.DB.prepare('DELETE FROM platonus_imports'),env.DB.prepare('DELETE FROM platonus_snapshots'),env.DB.prepare("DELETE FROM homework WHERE id='plato-homework'"),env.DB.prepare("DELETE FROM schedule_slots WHERE weekday=6")])})
const section={tables:[],links:[],error:null}
function snapshot(){return {capturedAt:new Date().toISOString(),semesterStart:'2026-09-01',semesterEnd:'2026-12-12',weeks:[2,3],lessons:[parseLesson("Новый учебный предмет,'СПЗ' (Нұрмағанбет Н.Ж.), корпус №2, 506",'09:00 - 10:45',6,1,2)],grades:section,umkd:section}}
async function upload(input=snapshot()){expect((await call('/connector/platonus/snapshot',input)).status).toBe(200);return (await call('/platonus')).data}
async function apply(data:any,index=0){return call('/platonus/import',{snapshotId:data.snapshot.id,index,revision:data.rows[index].revision})}
it('reviews without dismissing and acknowledges only the snapshot actually reviewed',async()=>{
 const first=await upload();await env.DB.prepare('UPDATE platonus_connection SET schedule_changed=1 WHERE id=1').run()
 const preview=await call('/platonus');expect(preview.data.campusOnly).toBeInstanceOf(Array)
 expect((await call('/platonus/connection')).data.scheduleChanged).toBe(true)
 await upload()
 expect((await call('/platonus/acknowledge',{snapshotId:first.snapshot.id})).status).toBe(409)
 expect((await call('/platonus/connection')).data.scheduleChanged).toBe(true)
 const current=(await call('/platonus')).data
 expect((await call('/platonus/acknowledge',{snapshotId:current.snapshot.id})).status).toBe(200)
 expect((await call('/platonus/connection')).data.scheduleChanged).toBe(false)
})
it('parses actual Platonus syntax and preserves Kazakh names, types and unknown values',()=>{
 expect(parseLesson("Экология и безопасность жизнедеятельности,'СПЗ' ( Нұрмағанбет Н.Ж.), корпус №2, 506",'13:10 - 14:55',3,3,2)).toMatchObject({subject:'Экология и безопасность жизнедеятельности',teacher:'Нұрмағанбет Н.Ж.',lessonType:'Семинар / практическое занятие',building:'корпус №2',room:'506'})
 expect(parseLesson("Математика,'Л' ()",'09:00 - 10:45',1,1,2)).toMatchObject({teacher:null,room:null,building:null})
 expect(()=>parseLesson('Математика, учитель неизвестен','09:00 - 10:45',1,1,2)).toThrow()
 expect(()=>parseLesson("Математика,'Л' ()",'10:45 - 09:00',1,1,2)).toThrow()
 expect(semesterDates('01.09.2026 - 12.12.2026')).toEqual({semesterStart:'2026-09-01',semesterEnd:'2026-12-12'})
 expect(()=>semesterDates('31.02.2026 - 12.12.2026')).toThrow()
})
it('previews without mutation, imports once, retains manual lessons and supports guarded rollback',async()=>{
 const count=await env.DB.prepare('SELECT count(*) AS n FROM schedule_slots').first<any>()
 const data=await upload();expect(data.rows[0].status).toBe('add')
 expect(await env.DB.prepare('SELECT count(*) AS n FROM schedule_slots').first()).toEqual(count)
 const result=await apply(data);expect(result.status,JSON.stringify(result)).toBe(200)
 const slot=await env.DB.prepare('SELECT * FROM schedule_slots WHERE id=?').bind(result.data.slotId).first<any>();expect(slot).toMatchObject({week_type:'even',lesson_type:'Семинар / практическое занятие',valid_until:'2026-12-12',room:'506'})
 expect((await apply(data)).status).toBe(409)
 expect((await call(`/platonus/imports/${result.data.id}/revert`,{})).status).toBe(200)
 expect((await env.DB.prepare('SELECT is_active FROM schedule_slots WHERE id=?').bind(result.data.slotId).first<any>()).is_active).toBe(0)
 expect(await env.DB.prepare('SELECT count(*) AS n FROM schedule_slots WHERE is_active=1').first()).toEqual(count)
})
it('refuses to overwrite a manual collision or stale preview',async()=>{
 const data=await upload()
 await env.DB.prepare("INSERT INTO schedule_slots(id,subject_id,weekday,slot_number,start_time,end_time,week_type) VALUES('manual-conflict','subject-philosophy',6,1,'09:00','10:45','both')").run()
 expect((await apply(data)).status).toBe(409)
 expect((await call('/platonus')).data.rows[0].status).toBe('conflict')
})
it('rejects unexpected credentials, duplicate subgroup rows and untrusted links',async()=>{
 expect((await call('/connector/platonus/snapshot',{...snapshot(),password:'must not be accepted'})).status).toBe(400)
 const input=snapshot();input.lessons.push(input.lessons[0]);expect((await call('/connector/platonus/snapshot',input)).status).toBe(400)
 expect((await call('/connector/platonus/snapshot',{...snapshot(),umkd:{...section,links:[{title:'file',url:'https://evil.example/file'}]}})).status).toBe(400)
})
it('does not roll back a newly imported lesson after homework has been attached',async()=>{
 const result=await apply(await upload());expect(result.status).toBe(200)
 const slot=await env.DB.prepare('SELECT subject_id FROM schedule_slots WHERE id=?').bind(result.data.slotId).first<any>()
 await env.DB.prepare("INSERT INTO homework(id,subject_id,schedule_slot_id,title) VALUES('plato-homework',?,?,'Written later')").bind(slot.subject_id,result.data.slotId).run()
 expect((await call(`/platonus/imports/${result.data.id}/revert`,{})).status).toBe(409)
})
it('retains a previously received grade table when the next fetch fails',async()=>{
 await upload({...snapshot(),grades:{...section,tables:[{title:'Оценки',headers:['Предмет','Балл'],rows:[['Математика','80']]}]}} as any)
 await env.DB.prepare("UPDATE platonus_snapshots SET created_at='2020-01-01T00:00:00.000Z'").run()
 const data=await upload({...snapshot(),grades:{...section,error:'Сайт временно недоступен'}} as any)
 expect(data.snapshot.grades.tables[0].rows[0][1]).toBe('80');expect(data.snapshot.grades.error).toContain('недоступен');expect(data.snapshot.grades.capturedAt).toBeTruthy()
})

it('updates an existing matching class and blocks rollback after a subsequent manual edit',async()=>{
 const slot=await env.DB.prepare("SELECT ss.*,s.name AS subject FROM schedule_slots ss JOIN subjects s ON s.id=ss.subject_id WHERE ss.id='slot-odd-1-1'").first<any>()
 const input=snapshot();input.lessons=[{subject:slot.subject,teacher:'Новый преподаватель А.Б.',lessonType:'Семинар',building:slot.building,room:'999',weekday:slot.weekday,slotNumber:slot.slot_number,startTime:slot.start_time,endTime:slot.end_time,weekNumber:3}]
 const data=await upload(input);expect(data.rows[0].status).toBe('update')
 const result=await apply(data);expect(result.status,JSON.stringify(result)).toBe(200)
 await env.DB.prepare("UPDATE schedule_slots SET room='888' WHERE id=?").bind(result.data.slotId).run()
 expect((await call(`/platonus/imports/${result.data.id}/revert`,{})).status).toBe(409)
})
