import {env} from 'cloudflare:workers'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {parseJournalOptions,parseJournalSubjects,parseJournalRecords} from '../services/journal-parser'
import {loadJournal,journalOptions} from '../services/platonus-journal'
import {seal} from '../services/platonus-cloud'
const scoped={...env,REGISTRY:env.DB,OWNER_ID:'journal-owner'}
const years={studyYearList:[{ID:2025,name:'2025–2026'},{ID:2026,name:'2026–2027'}],defaultYear:2026,defaultTerm:1}
const terms=[{ID:1,name:'1'},{ID:2,name:'2'},{ID:0,name:'Дополнительный академический период'}]
const subjects=[{subjectID:1,subjectName:'Қазақ тілі',tutorList:'<b>Әлия</b>',centerMark:'85',totalMark:'0',exams:[{name:'Экзамен',mark:'&nbsp;',markTypeId:1}]}]
beforeEach(async()=>{await env.DB.batch([env.DB.prepare("INSERT OR IGNORE INTO accounts(id,login,display_name,password_hash) VALUES('journal-owner','journal-owner','Journal owner','test')"),env.DB.prepare("DELETE FROM grade_notifications WHERE account_id='journal-owner'"),env.DB.prepare('DELETE FROM platonus_journals'),env.DB.prepare('DELETE FROM platonus_journal_options'),env.DB.prepare('DELETE FROM platonus_connection'),env.DB.prepare("INSERT INTO platonus_connection(id,revision,status,session_cipher,credentials_cipher) VALUES(1,'journal-test','connected',?,?)").bind(await seal(scoped,{token:'test'}),await seal(scoped,{login:'test',password:'test'}))])})
afterEach(()=>vi.restoreAllMocks())
function mock(){return vi.spyOn(globalThis,'fetch').mockImplementation(async input=>{const url=String(input);if(url.includes('studyYears'))return Response.json(years);if(url.includes('/terms/'))return Response.json(terms);if(url.includes('/journal/records/'))return Response.json([]);if(url.includes('/journal/'))return Response.json(subjects);throw new Error('Unexpected request')})}
it('uses available academic years and retains additional term zero',()=>{const result=parseJournalOptions(years,terms);expect(result.terms.map(x=>x.id)).toEqual([1,2,0]);expect(result.defaultYear).toBe(2026)})
it('returns old cached grades immediately without waiting for an offline university',async()=>{
 const fetch=mock();await loadJournal(scoped,2025,1)
 await env.DB.batch([env.DB.prepare("UPDATE platonus_journals SET captured_at='2020-01-01'"),env.DB.prepare("UPDATE platonus_journal_options SET captured_at='2020-01-01'")])
 fetch.mockClear();fetch.mockRejectedValue(new Error('Offline'))
 expect((await loadJournal(scoped,2025,1)).subjects[0].score).toBe('85');expect(fetch).not.toHaveBeenCalled()
})
it('preserves zero and blank grades and rejects unrelated numeric fields',()=>{expect(parseJournalSubjects(subjects)[0]).toMatchObject({teacher:'Әлия',finalScore:'0',exams:[{mark:''}]});expect(()=>parseJournalSubjects([{subjectID:1,subjectName:'Math',credits:5}])).toThrow()})
it('isolates cached years and preserves prior grades if the university fails',async()=>{const fetch=mock();expect((await loadJournal(scoped,2025,1)).subjects[0].score).toBe('85');fetch.mockImplementation(async()=>Response.json([]));expect((await loadJournal(scoped,2026,1)).subjects).toEqual([]);fetch.mockResolvedValue(new Response('',{status:503}));expect((await loadJournal(scoped,2025,1,true))).toMatchObject({year:2025,subjects:[{score:'85'}],error:expect.stringContaining('503')});expect((await loadJournal(scoped,2026,1)).subjects).toEqual([])})
it('rejects unavailable periods without requesting their journal',async()=>{const fetch=mock();await journalOptions(scoped);fetch.mockClear();await expect(loadJournal(scoped,2024,1)).rejects.toThrow('недоступен');expect(fetch).not.toHaveBeenCalled()})
it('renews an expired session once and does not publish after disconnect',async()=>{const fetch=mock();await journalOptions(scoped);let calls=0;fetch.mockImplementation(async input=>{if(String(input).endsWith('/login')){calls++;return Response.json({login_status:'success',auth_token:'new'})}if(calls===0)return new Response('',{status:401});await env.DB.prepare("UPDATE platonus_connection SET revision='disconnected',status='disconnected',session_cipher=NULL,credentials_cipher=NULL").run();return Response.json(subjects)});await expect(loadJournal(scoped,2025,1)).rejects.toThrow('Подключение изменилось');expect(calls).toBe(1);expect(await env.DB.prepare('SELECT * FROM platonus_journals').first()).toBeNull()})
it('never returns a previous Platonus account cache after the connection changes',async()=>{mock();await loadJournal(scoped,2025,1);await env.DB.prepare("UPDATE platonus_connection SET revision='new-account',status='disconnected',session_cipher=NULL,credentials_cipher=NULL").run();await expect(loadJournal(scoped,2025,1)).rejects.toThrow('Подключите')})

it('accepts semester two empty exam placeholders and missing type IDs without inventing grades',()=>{const value=parseJournalSubjects([{...subjects[0],exams:[{name:'Экзамен',mark:'90'},{}]}]);expect(value[0].exams).toEqual([{name:'Экзамен',mark:'90',typeId:null}])})
it('notifies only after a grade is added or changed and deduplicates repeated syncs',async()=>{
 const fetch=mock();await loadJournal(scoped,2025,1);expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM grade_notifications WHERE account_id='journal-owner'").first<{count:number}>())?.count).toBe(0)
 fetch.mockImplementation(async input=>String(input).includes('/api/journal/')?Response.json([{...subjects[0],exams:[{name:'Экзамен',mark:'92',markTypeId:1}]}]):String(input).includes('studyYears')?Response.json(years):Response.json(terms))
 await loadJournal(scoped,2025,1,true);let notices=await env.DB.prepare("SELECT title,body FROM grade_notifications WHERE account_id='journal-owner'").all<{title:string;body:string}>();expect(notices.results).toEqual([expect.objectContaining({title:'Новая оценка',body:expect.stringContaining('Экзамен: 92')})])
 await loadJournal(scoped,2025,1,true);expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM grade_notifications WHERE account_id='journal-owner'").first<{count:number}>())?.count).toBe(1)
 fetch.mockImplementation(async input=>String(input).includes('/api/journal/')?Response.json([{...subjects[0],exams:[{name:'Экзамен',mark:'95',markTypeId:1}]}]):String(input).includes('studyYears')?Response.json(years):Response.json(terms))
 await loadJournal(scoped,2025,1,true);notices=await env.DB.prepare("SELECT title,body FROM grade_notifications WHERE account_id='journal-owner' ORDER BY created_at").all<{title:string;body:string}>();expect(notices.results.at(-1)).toMatchObject({title:'Оценка изменена',body:expect.stringContaining('92 → 95')})
})
it('notifies about two equal marks under one name and about a mark that returns to an earlier value',async()=>{
 const fetch=mock(),journal=(exams:unknown[])=>fetch.mockImplementation(async input=>String(input).includes('/api/journal/')?Response.json([{...subjects[0],exams}]):String(input).includes('studyYears')?Response.json(years):Response.json(terms))
 await loadJournal(scoped,2025,1);journal([{name:'Экзамен',mark:'100',markTypeId:1},{name:'Экзамен',mark:'100',markTypeId:1}])
 const value=await loadJournal(scoped,2025,1,true);expect(value.subjects[0].exams.map(e=>e.mark)).toEqual(['100','100'])
 const count=async()=>(await env.DB.prepare("SELECT COUNT(*) AS count FROM grade_notifications WHERE account_id='journal-owner'").first<{count:number}>())?.count
 expect(await count()).toBe(2)
 journal([{name:'Экзамен',mark:'95',markTypeId:1},{name:'Экзамен',mark:'100',markTypeId:1}]);await loadJournal(scoped,2025,1,true);expect(await count()).toBe(3)
 journal([{name:'Экзамен',mark:'100',markTypeId:1},{name:'Экзамен',mark:'100',markTypeId:1}]);await loadJournal(scoped,2025,1,true);expect(await count()).toBe(4)
})

it('reads individual marks by date from subject records, keeping two equal marks',()=>{
 expect(parseJournalRecords({records:[{lessonDate:'16.09.2026',markTypeName:'Текущий',mark:'100'},{lessonDate:'23.09.2026',markTypeName:'Текущий',mark:100},{lessonDate:'30.09.2026',mark:'&nbsp;'}]})).toEqual([{date:'2026-09-16',mark:'100',type:'Текущий'},{date:'2026-09-23',mark:'100',type:'Текущий'}])
 expect(parseJournalRecords([{date:'2026-09-10',marks:[{mark:'90'},{mark:'95'}]}]).map(m=>[m.date,m.mark])).toEqual([['2026-09-10','90'],['2026-09-10','95']])
 expect(parseJournalRecords(null)).toEqual([])
})
it('loads per-subject records, notifies each new dated mark and survives a failing records request',async()=>{
 let records:unknown=[{lessonDate:'16.09.2026',mark:'100'}],fail=false
 vi.spyOn(globalThis,'fetch').mockImplementation(async input=>{const url=String(input);if(url.includes('studyYears'))return Response.json(years);if(url.includes('/terms/'))return Response.json(terms);if(url.includes('/journal/records/')){if(fail)return new Response('x',{status:500});expect(url).toContain('subjectID=1');return Response.json(records)}return Response.json(subjects)})
 expect((await loadJournal(scoped,2025,1)).subjects[0].marks).toEqual([{date:'2026-09-16',mark:'100',type:''}])
 records=[{lessonDate:'16.09.2026',mark:'100'},{lessonDate:'23.09.2026',mark:'100'}]
 expect((await loadJournal(scoped,2025,1,true)).subjects[0].marks?.map(m=>m.mark)).toEqual(['100','100'])
 const notices=await env.DB.prepare("SELECT body FROM grade_notifications WHERE account_id='journal-owner'").all<{body:string}>()
 expect(notices.results).toEqual([{body:expect.stringContaining('(23.09.2026): 100')}])
 fail=true;const value=await loadJournal(scoped,2025,1,true);expect(value.subjects[0].score).toBe('85');expect(value.subjects[0].marksError).toBeTruthy()
})
