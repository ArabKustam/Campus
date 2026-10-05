import {env} from 'cloudflare:workers'
import {it,expect,vi,afterEach,beforeEach} from 'vitest'
import {app} from '../app'
import {seal} from '../services/platonus-cloud'
import {queueStudyArchive,runStudyArchive,archiveDocument} from '../services/study-archive'
const scoped={...env,OWNER_ID:'files-owner'}
beforeEach(async()=>{
 await env.DB.prepare('DELETE FROM platonus_snapshots').run()
 await env.DB.prepare('INSERT INTO platonus_snapshots(id,payload_json) VALUES(?,?)').bind('files',JSON.stringify({umkd:{links:[{url:'https://platonus.kstu.kz/v7/#/umkd/studentUmkd/5'}]}})).run()
 await env.DB.prepare("UPDATE platonus_connection SET status='connected',session_cipher=? WHERE id=1").bind(await seal(scoped,{token:'private-token'})).run()
 await env.DB.prepare('DELETE FROM umkd_documents').run()
 await env.DB.prepare('DELETE FROM umkd_versions').run()
 await env.DB.prepare('DELETE FROM umkd_catalog').run()
 await env.DB.prepare('DELETE FROM study_archive_jobs').run()
})
afterEach(()=>vi.restoreAllMocks())
it('serves an authorized PDF without passing credentials or upstream URLs to the browser',async()=>{
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{expect(new Headers(init?.headers).get('token')).toBe('private-token');return String(url).includes('/rest/')?Response.json([{fileTypeID:10,nameru:'Силлабус'}]):new Response('%PDF-1.7\nexample')})
 const response=await app.request('/api/platonus/umkd/5/files/10',{},scoped)
 expect(response.status).toBe(200);expect(response.headers.get('content-type')).toBe('application/pdf');expect(response.headers.get('cache-control')).toBe('private, no-store');expect(await response.text()).toContain('%PDF-')
})
it('rejects a course outside this account snapshot before calling Platonus',async()=>{const spy=vi.spyOn(globalThis,'fetch');const response=await app.request('/api/platonus/umkd/999/files',{},scoped);expect(response.status).toBe(422);expect(spy).not.toHaveBeenCalled()})
it('does not serve upstream HTML as a document',async()=>{vi.spyOn(globalThis,'fetch').mockImplementation(async url=>String(url).includes('/rest/')?Response.json([{fileTypeID:10,nameru:'Силлабус'}]):new Response('<html>login</html>'));const response=await app.request('/api/platonus/umkd/5/files/10',{},scoped);expect(response.status).toBe(422);expect(await response.text()).not.toContain('<html>')})
it('opens saved PDFs and file lists without any contact with Platonus',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async url=>String(url).includes('/rest/')?Response.json([{fileTypeID:10,nameru:'Силлабус'}]):new Response('%PDF-1.7\narchived'))
 expect((await app.request('/api/platonus/umkd/5/files/10',{},scoped)).status).toBe(200)
 await env.DB.prepare("UPDATE platonus_connection SET status='disconnected',session_cipher=NULL").run()
 fetch.mockClear();fetch.mockRejectedValue(new Error('University offline'))
 const list=await app.request('/api/platonus/umkd/5/files',{},scoped)
 expect((await list.json() as any).data[0].saved).toBe(true)
 const file=await app.request('/api/platonus/umkd/5/files/10',{},scoped)
 expect(file.status).toBe(200);expect(await file.text()).toContain('archived');expect(fetch).not.toHaveBeenCalled()
})
it('archives published documents in the background before a user opens them',async()=>{
 const scheduleStudyRetry=vi.fn(async()=>{})
 vi.spyOn(globalThis,'fetch').mockImplementation(async url=>String(url).includes('/rest/')?Response.json([{fileTypeID:10,nameru:'Силлабус'}]):new Response('%PDF-1.7\nbackground'))
 const background={...scoped,scheduleStudyRetry}
 await queueStudyArchive(background)
 await env.DB.prepare("DELETE FROM study_archive_jobs WHERE kind='options'").run()
 await runStudyArchive(background);await runStudyArchive(background)
 expect((await env.DB.prepare('SELECT file_id FROM umkd_documents').first<{file_id:string}>())?.file_id).toBe('10')
 expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM study_archive_jobs').first<{count:number}>())?.count).toBe(0)
 expect(scheduleStudyRetry).toHaveBeenLastCalledWith(null)
})

it('retains changed PDFs and serves a selected old version offline with account-scoped lookup',async()=>{
 let text='%PDF-1.7 old'
 const network=vi.spyOn(globalThis,'fetch').mockImplementation(async url=>String(url).includes('/rest/')?Response.json([{fileTypeID:10,nameru:'Силлабус'}]):new Response(text))
 const first=await archiveDocument(scoped,'5','10')
 await env.DB.prepare("UPDATE umkd_documents SET captured_at='2020-01-01T00:00:00Z'").run()
 text='%PDF-1.7 new';await archiveDocument(scoped,'5','10',true)
 const list=await app.request('/api/platonus/umkd/5/files/10/versions',{},scoped)
 expect((await list.json() as any).data).toHaveLength(2)
 network.mockRejectedValue(new Error('offline'))
 const old=await app.request('/api/platonus/umkd/5/files/10?version='+encodeURIComponent(first),{},scoped)
 expect(await old.text()).toContain('old')
 expect((await app.request('/api/platonus/umkd/999/files/10?version='+encodeURIComponent(first),{},scoped)).status).toBe(404)
 expect(await (await app.request('/api/platonus/umkd/5/files/10',{},scoped)).text()).toContain('new')
})
it('does not create another version when the content is unchanged',async()=>{
 vi.spyOn(globalThis,'fetch').mockImplementation(async url=>String(url).includes('/rest/')?Response.json([{fileTypeID:10,nameru:'Силлабус'}]):new Response('%PDF-1.7 same'))
 const first=await archiveDocument(scoped,'5','10')
 await env.DB.prepare("UPDATE umkd_documents SET captured_at='2020-01-01T00:00:00Z'").run()
 expect(await archiveDocument(scoped,'5','10',true)).toBe(first)
 expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM umkd_versions').first<any>())?.n).toBe(1)
})
