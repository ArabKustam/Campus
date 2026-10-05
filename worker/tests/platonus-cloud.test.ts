import {env} from 'cloudflare:workers'
import {createExecutionContext,waitOnExecutionContext} from 'cloudflare:test'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {app} from '../app'
import {connection,seal,unseal,syncPlatonus} from '../services/platonus-cloud'
import {viewerLessons,parseViewer,parseUmkd,parseJournal} from '../services/platonus-api'
const scoped={...env,OWNER_ID:'owner-one'}
const viewer=(week=2)=>({selectedStudyYear:2026,selectedTerm:1,selectedWeek:week,studentID:123,weekList:[1,2,3],startSemesterPeriod:'01.09.2026',finishSemesterPeriod:'12.12.2026',lessonHours:[{number:1,displayNumber:1,start:'09:00:00',finish:'10:45:00'}],timetable:{days:{'1':{lessons:{'1':{lessons:[{studyGroupName:"Экология,'СПЗ'",tutorName:'Нұрмағанбет Н.Ж.',building:'Корпус №2',auditory:'506',subNumber:0}]}}}}}})
function mock(){return vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
 const url=String(input)
 if(url.endsWith('/rest/api/login'))return Response.json({login_status:'success',auth_token:'PRIVATE-TEST-TOKEN',sid:'private-sid'})
 expect(new Headers(init?.headers).get('token')).toBe('PRIVATE-TEST-TOKEN')
 if(url.includes('/initial/'))return Response.json(viewer())
 if(url.includes('/calculate/'))return Response.json(viewer(JSON.parse(String(init?.body)).week))
 if(url.includes('/journal/'))return Response.json({subjects:[{subjectName:'Экология',mark:0}]})
 if(url.includes('/studentRecords/'))return Response.json({records:[{subjectName:'Экология',credits:5,tutorName:'Нұрмағанбет Н.Ж.',umkdID:1}]})
 throw new Error('Unexpected URL '+url)
})}
async function call(path:string,body?:unknown){const ctx=createExecutionContext();const r=await app.request('/api/platonus/'+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})},scoped,ctx);const data=await r.json() as any;await waitOnExecutionContext(ctx);return {status:r.status,...data}}
beforeEach(async()=>{await env.DB.batch([env.DB.prepare('DELETE FROM platonus_connection'),env.DB.prepare("INSERT INTO platonus_connection(id,revision) VALUES(1,'test')"),env.DB.prepare('DELETE FROM platonus_snapshots')])})
afterEach(()=>vi.restoreAllMocks())
it('defaults to a one-time import without storing credentials or allowing subsequent refreshes',async()=>{
 const fetch=mock();expect((await call('login',{login:'student',password:'one-time-secret'})).status).toBe(200)
 const row=await connection(env.DB);expect(row.credentials_cipher).toBeNull();expect(row.last_sync_at).not.toBeNull();expect(row.retry_at).toBeNull()
 fetch.mockClear();await syncPlatonus(scoped);await syncPlatonus(scoped,true);expect(fetch).not.toHaveBeenCalled()
 expect((await call('sync',{})).status).toBe(409)
 expect((await call('grades?year=2026&term=1',{})).status).toBe(409)
 expect((await call('grades/options?refresh=1')).status).toBe(409)
 expect((await env.DB.prepare('SELECT count(*) AS n FROM platonus_snapshots').first<any>()).n).toBeGreaterThan(0)
})
it('does not persist credentials or retry failed one-time logins',async()=>{
 mock().mockRejectedValue(new Error('offline'))
 expect((await call('login',{login:'student',password:'one-time-secret',remember:false})).status).toBe(422)
 const row=await connection(env.DB);expect(row.credentials_cipher).toBeNull();expect(row.session_cipher).toBeNull();expect(row.retry_at).toBeNull()
})
it('does not retain a password in a one-time verification challenge',async()=>{
 const fetch=mock();fetch.mockImplementationOnce(async()=>Response.json({login_status:'verificationCode',challengeId:'one-time'}))
 await call('login',{login:'student',password:'one-time-secret',remember:false})
 const row=await connection(env.DB),challenge=await unseal<any>(scoped,row.challenge_cipher!)
 expect(challenge.credentialsCipher).toBeNull();expect(row.credentials_cipher).toBeNull()
 fetch.mockImplementationOnce(async()=>Response.json({login_status:'success',auth_token:'PRIVATE-TEST-TOKEN'}))
 expect((await call('verify',{code:'123456'})).status).toBe(200);expect((await connection(env.DB)).credentials_cipher).toBeNull()
})
it('logs in without a connector, encrypts owner-bound session, and fetches two weeks/grades/UMKD',async()=>{
 mock();const result=await call('login',{login:'student',password:'secret-password',remember:true});expect(result.status).toBe(200)
 const row=await connection(env.DB);expect(row.status).toBe('connected');expect(row.last_error).toBeNull()
 expect(JSON.stringify(row)).not.toContain('PRIVATE-TEST-TOKEN');expect(JSON.stringify(row)).not.toContain('secret-password');expect(JSON.stringify(result)).not.toContain('private-sid')
 expect((await unseal<any>(scoped,row.credentials_cipher!)).password).toBe('secret-password')
 expect((await unseal<any>(scoped,row.session_cipher!)).token).toBe('PRIVATE-TEST-TOKEN')
 await expect(unseal({...scoped,OWNER_ID:'other-owner'},row.session_cipher!)).rejects.toThrow('owner')
 const snapshot=JSON.parse((await env.DB.prepare('SELECT payload_json FROM platonus_snapshots').first<any>()).payload_json)
 expect(snapshot.weeks).toEqual([2,3]);expect(snapshot.lessons[0].teacher).toBe('Нұрмағанбет Н.Ж.');expect(snapshot.grades.tables[0].rows[0]).toEqual(['Экология','0']);expect(snapshot.umkd.tables[0].rows).toHaveLength(1)
 expect(JSON.stringify(await call('connection'))).not.toContain('cipher')
})
it('handles verification codes without saving the login password',async()=>{
 const fetch=mock();fetch.mockImplementationOnce(async()=>Response.json({login_status:'verificationCode',challengeId:'challenge-secret',verifyStatus:'EMAIL_SENT'},{headers:{'set-cookie':'JSESSIONID=challenge-cookie; Secure; HttpOnly; Path=/'}}))
 expect((await call('login',{login:'student',password:'secret-password',remember:true})).data.needsCode).toBe(true)
 const row=await connection(env.DB);expect(row.session_cipher).toBeNull();expect(row.challenge_cipher).not.toContain('challenge-secret')
 fetch.mockImplementationOnce(async(_input,init)=>{expect(new Headers(init?.headers).get('cookie')).toBe('JSESSIONID=challenge-cookie');expect(new Headers(init?.headers).has('token')).toBe(false);expect(JSON.parse(String(init?.body))).toEqual({challengeId:'challenge-secret',code:'123456'});return Response.json({login_status:'success',auth_token:'PRIVATE-TEST-TOKEN'})})
 expect((await call('verify',{code:'123456'})).status).toBe(200);expect((await connection(env.DB)).status).toBe('connected')
})
it('preserves imported data on session expiry and erases the unusable credential',async()=>{
 mock();await call('login',{login:'student',password:'password',remember:true})
 vi.mocked(fetch).mockResolvedValue(new Response('',{status:401}))
 await syncPlatonus(scoped,true)
 expect((await connection(env.DB)).status).toBe('expired');expect((await connection(env.DB)).session_cipher).toBeNull()
 expect((await env.DB.prepare('SELECT count(*) AS n FROM platonus_snapshots').first<any>()).n).toBe(1)
})
it('bounds repeated login attempts and never exposes an upstream error payload',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({login_status:'invalid',message:'upstream-secret'}))
 for(let i=0;i<5;i++){const r=await call('login',{login:'wrong',password:'secret'});expect(r.status).toBe(422);expect(JSON.stringify(r)).not.toContain('upstream-secret')}
 expect((await call('login',{login:'wrong',password:'secret'})).status).toBe(429);expect(fetch).toHaveBeenCalledTimes(5)
})
it('disconnects and prevents further automatic synchronization',async()=>{
 const fetch=mock();await call('login',{login:'student',password:'password',remember:true});await call('disconnect',{})
 const row=await connection(env.DB);expect(row.status).toBe('disconnected');expect(row.session_cipher).toBeNull();expect(row.credentials_cipher).toBeNull();fetch.mockClear();await syncPlatonus(scoped);expect(fetch).not.toHaveBeenCalled()
})
it('rejects ambiguous subgroup schedules and unknown grade shapes rather than guessing',()=>{
 const raw=viewer();raw.timetable.days['1'].lessons['1'].lessons[0].subNumber=1
 expect(()=>viewerLessons(parseViewer(raw))).toThrow('подгруппы')
 expect(()=>parseJournal({subjects:[{subjectName:'Math',credits:5}]})).toThrow('формат оценок')
 expect(()=>parseUmkd({users:[{name:'not a course'}]})).toThrow('УМКД')
})

it('explains a rejected login without exposing upstream details',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({message:'private detail',login_status:'invalid'},{status:400}))
 const result=await call('login',{login:'invalid',password:'invalid'})
 expect(result.status).toBe(422);expect(result.error.message).toContain('Проверьте логин и пароль');expect(JSON.stringify(result)).not.toContain('private detail')
})

it('maps internal Platonus time-slot IDs to the displayed pair number',()=>{
 const raw=viewer();raw.lessonHours[0].number=1201;raw.lessonHours[0].displayNumber=2
 const cell=raw.timetable.days['1'].lessons['1']
 ;(raw.timetable.days['1'] as any).lessons={'1201':cell}
 const lessons=viewerLessons(parseViewer(raw));expect(lessons[0].slotNumber).toBe(2);expect(lessons[0].startTime).toBe('09:00')
})

it('retains encrypted credentials on transport failure and schedules a five-minute server retry',async()=>{
 await env.DB.prepare('UPDATE schedule_slots SET is_active=0').run()
 const alarm=vi.fn(async(_at:number|null)=>{});Object.assign(scoped,{schedulePlatonusRetry:alarm})
 vi.spyOn(globalThis,'fetch').mockRejectedValue(new TypeError('network offline'))
 const started=Date.now(),result=await call('login',{login:'student',password:'offline-password',remember:true})
 expect(result.status).toBe(202);const row=await connection(env.DB)
 expect(row.retry_at).toBeGreaterThanOrEqual(started+300000);expect(row.retry_at).toBeLessThanOrEqual(Date.now()+300000)
 expect((await unseal<any>(scoped,row.credentials_cipher!)).password).toBe('offline-password')
 expect(JSON.stringify(result)).not.toContain('offline-password');expect(alarm).toHaveBeenLastCalledWith(row.retry_at)
 vi.mocked(fetch).mockRestore();mock();await syncPlatonus(scoped,true)
 const done=await connection(env.DB);expect(done.initial_import_done).toBe(1);expect(done.retry_at).toBeNull();expect(done.status).toBe('connected');expect(alarm).toHaveBeenLastCalledWith(null)
 const imported=await env.DB.prepare("SELECT COUNT(*) AS n FROM platonus_imports WHERE source_json LIKE '%Экология%'").first<any>();expect(imported.n).toBeGreaterThan(0)
})
it('does not schedule retries for invalid credentials and cancels a pending retry on disconnect',async()=>{
 const alarm=vi.fn(async(_at:number|null)=>{});Object.assign(scoped,{schedulePlatonusRetry:alarm})
 vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({login_status:'invalid'}))
 expect((await call('login',{login:'student',password:'incorrect'})).status).toBe(422)
 expect((await connection(env.DB)).retry_at).toBeNull();expect(alarm.mock.calls.every(([at])=>at===null)).toBe(true)
 vi.mocked(fetch).mockRejectedValue(new TypeError('offline'))
 await call('login',{login:'student',password:'test-password',remember:true});expect((await connection(env.DB)).retry_at).not.toBeNull()
 await call('disconnect',{});expect((await connection(env.DB)).retry_at).toBeNull();expect((await connection(env.DB)).credentials_cipher).toBeNull();expect(alarm).toHaveBeenLastCalledWith(null)
})
it('retries unavailable grade sections while preserving the imported schedule',async()=>{
 const alarm=vi.fn(async(_at:number|null)=>{});Object.assign(scoped,{schedulePlatonusRetry:alarm})
 const original=mock().getMockImplementation()!
 vi.mocked(fetch).mockImplementation(async(input,init)=>String(input).includes('/journal/')?new Response('',{status:503}):original(input,init))
 await call('login',{login:'student',password:'test-password',remember:true});const state=await connection(env.DB)
 expect(state.initial_import_done).toBe(1);expect(state.retry_at).not.toBeNull();expect(alarm).toHaveBeenLastCalledWith(state.retry_at)
 const count=await env.DB.prepare('SELECT count(*) AS n FROM schedule_slots').first<any>()
 vi.mocked(fetch).mockImplementation(original);await syncPlatonus(scoped,true)
 expect((await connection(env.DB)).retry_at).toBeNull();expect(await env.DB.prepare('SELECT count(*) AS n FROM schedule_slots').first<any>()).toEqual(count)
})

it('recognizes an empty journal without inventing scores',()=>{expect(parseJournal({subjects:[]}).error).toBeNull();expect(parseJournal({subjects:[]}).tables[0].rows).toEqual([])})
it('keeps repeated journal marks with the same name instead of collapsing them',()=>{const table=parseJournal([{subjectID:1,subjectName:'Math',tutorList:'',centerMark:'100',totalMark:'',exams:[{name:'Рубежный контроль',mark:'100'},{name:'Рубежный контроль',mark:'100'},{name:'Экзамен',mark:''}]},{subjectID:2,subjectName:'Art',tutorList:'',centerMark:'90',totalMark:'',exams:[{name:'Рубежный контроль',mark:'90'}]}]).tables[0];expect(table.headers).toEqual(['Предмет','Преподаватель','Балл Platonus','Итог','Рубежный контроль','Рубежный контроль','Экзамен']);expect(table.rows).toEqual([['Math','','100','','100','100',''],['Art','','90','','90','','']])})
