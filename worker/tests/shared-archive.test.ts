import {env} from 'cloudflare:workers'
import {runInDurableObject} from 'cloudflare:test'
import {it,expect,vi} from 'vitest'
import {sharedStub,sharedRequest,storedDocument} from '../services/shared-archive'
import {archiveDocument,runStudyArchive} from '../services/study-archive'

it('shares one fetched PDF, deduplicates concurrent reads, and retains historical content',async()=>{
 const stub=sharedStub(env,'82001')
 const network=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{await new Promise(resolve=>setTimeout(resolve,20));return new Response('%PDF-1.7 shared first')})
 try{

  const results=await Promise.all(Array.from({length:5},()=>sharedRequest(env,'82001','resolve',{file:'3',session:{token:'test'}})))
  expect(results.every(r=>r.ok),JSON.stringify(await Promise.all(results.map(r=>r.clone().text())))).toBe(true)
  const copies=await Promise.all(results.map(r=>r.json<any>()));expect(new Set(copies.map(c=>c.key)).size).toBe(1)
  await runInDurableObject(stub,async(_instance,state)=>{state.storage.sql.exec('UPDATE shared_current SET checked_at=0')})
  expect(network).toHaveBeenCalledTimes(1);network.mockImplementation(async()=>new Response('%PDF-1.7 shared second'))
  const updated=await sharedRequest(env,'82001','resolve',{file:'3',session:{token:'test'}})
  const next=await updated.json<any>();expect(next.key).not.toBe(copies[0].key)
  expect(await new Response((await storedDocument(env,copies[0].key))!.body).text()).toContain('first')
  expect(await new Response((await storedDocument(env,next.key))!.body).text()).toContain('second')
  // Another authorized account needs only the shared pointer, with no PDF request upstream.
  await env.DB.prepare('INSERT INTO umkd_catalog VALUES(?,?,?,?)').bind('82001','Shared course',JSON.stringify([{id:3,name:'Силлабус'}]),new Date().toISOString()).run()
  expect(await archiveDocument({...env,REGISTRY:env.DB,OWNER_ID:'second'},'82001','3')).toBe(next.key)
  expect(network).toHaveBeenCalledTimes(2)
 }finally{network.mockRestore()}
})

it('migrates an existing private PDF without Platonus and keeps a grace period for active readers',async()=>{
 const key='legacy-version',bytes=new TextEncoder().encode('%PDF-1.7 legacy')
 await env.ATTACHMENTS.put(key,bytes)
 await env.DB.prepare('INSERT INTO umkd_documents VALUES(?,?,?,?,?)').bind('82002','3',key,'2026-09-01',bytes.length).run()
 await env.DB.prepare('INSERT INTO umkd_versions VALUES(?,?,?,?,?)').bind('82002','3',key,'2026-09-01',bytes.length).run()
 await runStudyArchive({...env,REGISTRY:env.DB,OWNER_ID:'migration'})
 const row=await env.DB.prepare('SELECT storage_key,captured_at FROM umkd_versions WHERE course_id=?').bind('82002').first<any>()
 expect(row.storage_key).toMatch(/^shared:82002:/);expect(row.captured_at).toBe('2026-09-01')
 expect(await new Response((await storedDocument(env,row.storage_key))!.body).text()).toContain('legacy')
 expect(await env.ATTACHMENTS.get(key)).not.toBeNull()
 await env.DB.prepare("UPDATE study_archive_jobs SET due_at=0 WHERE kind='retire'").run()
 await runStudyArchive({...env,REGISTRY:env.DB,OWNER_ID:'migration'})
 expect(await env.ATTACHMENTS.get(key)).toBeNull()
})
