import type {Bindings} from '../types'
import {workspaceFiles} from '../workspace/files'
import {PLATONUS_ORIGIN,PlatonusError,type PlatonusSession} from './platonus-api'

export type ArchiveCopy={key:string;capturedAt:string;bytes:number}
export async function downloadUmkd(course:string,file:string,session:PlatonusSession){
 const response=await fetch(`${PLATONUS_ORIGIN}/downloadPdfUmkd?fileTypeID=${file}&umkdid=${course}`,{redirect:'manual',headers:{token:session.token,...(session.sid?{sid:session.sid}:{}),...(session.cookie?{cookie:session.cookie}:{})},signal:AbortSignal.timeout(25000)})
 if(response.status===401)throw new PlatonusError('Сессия истекла',true)
 if(!response.ok||!response.body)throw new Error('Platonus не отдал документ. Повторите обновление позже.')
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0
 try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>20*1024*1024)throw new Error('Документ больше 20 МБ.');chunks.push(part.value)}}finally{await reader.cancel()}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw new Error('Platonus не предоставил PDF. Повторите позже.')
 return bytes
}
export async function contentHash(bytes:Uint8Array){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes)))].map(b=>b.toString(16).padStart(2,'0')).join('')}
export function sharedStub(env:Bindings,course:string){return env.WORKSPACES.get(env.WORKSPACES.idFromName(`archive:${course}`))}
export async function sharedRequest(env:Bindings,course:string,path:string,body?:unknown){return sharedStub(env,course).fetch(`https://workspace/internal/shared/${path}`,{method:body?'POST':'GET',headers:{'x-campus-owner':`archive:${course}`},...(body?{body:JSON.stringify(body)}:{})})}
// Accessible only through a DO stub after the caller has checked the account's course catalogue.
export async function handleSharedArchive(storage:DurableObjectStorage,env:Bindings,course:string,request:Request,pending:Map<string,Promise<ArchiveCopy>>){
 storage.sql.exec('CREATE TABLE IF NOT EXISTS shared_current(file TEXT PRIMARY KEY, key TEXT NOT NULL, captured_at TEXT NOT NULL, checked_at INTEGER NOT NULL, bytes INTEGER NOT NULL)')
 const path=new URL(request.url).pathname.split('/').slice(3),files=workspaceFiles(storage)
 const saveBlob=async(bytes:Uint8Array,hash:string)=>{
  const id=`blob:${hash}`
  let task=pending.get(id)
  if(!task){task=(async()=>{
   const existing=await files.get(hash)
   if(existing)await existing.body.cancel();else{
    if(storage.sql.databaseSize+bytes.length>850*1024*1024)throw new Error('Хранилище дисциплины заполнено. Старые версии сохранены.')
    await files.put(hash,bytes,{httpMetadata:{contentType:'application/pdf'}})
   }
   return {key:`shared:${course}:${hash}`,bytes:bytes.length,capturedAt:new Date().toISOString()}
  })();pending.set(id,task)}
  try{return await task}finally{if(pending.get(id)===task)pending.delete(id)}
 }
 if(path[0]==='import'&&request.method==='POST'){
  if(Number(request.headers.get('content-length')??0)>20*1024*1024)return new Response(null,{status:413})
  const bytes=new Uint8Array(await request.arrayBuffer())
  if(bytes.length>20*1024*1024||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')return new Response(null,{status:400})
  const copy=await saveBlob(bytes,await contentHash(bytes))
  await env.DB.prepare('INSERT INTO storage_inventory VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET bytes=excluded.bytes,updated_at=excluded.updated_at').bind(`archive:${course}`,'archive',storage.sql.databaseSize,Date.now()).run()
  return Response.json(copy)
 }
 if(path[0]==='blob'&&/^[a-f0-9]{64}$/.test(path[1]??'')){const object=await files.get(path[1]);return object?new Response(object.body,{headers:{'content-type':'application/pdf'}}):new Response(null,{status:404})}
 if(path[0]!=='resolve'||request.method!=='POST')return new Response(null,{status:404})
 const body=await request.json() as {file:string;session?:PlatonusSession}
 if(!/^\d{1,10}$/.test(body.file))return new Response(null,{status:400})
 const current=()=>storage.sql.exec('SELECT * FROM shared_current WHERE file=?',body.file).toArray()[0]
 const cached=current()
 if(cached&&Date.now()-Number(cached.checked_at)<3600000)return Response.json({key:`shared:${course}:${cached.key}`,capturedAt:cached.captured_at,bytes:cached.bytes})
 if(!body.session)return new Response(null,{status:404})
 let task=pending.get(body.file)
 if(!task){
  task=(async()=>{
   const bytes=await downloadUmkd(course,body.file,body.session!),hash=await contentHash(bytes)
   await saveBlob(bytes,hash)
   const previous=current(),capturedAt=previous?.key===hash?String(previous.captured_at):new Date().toISOString()
   storage.sql.exec('INSERT INTO shared_current VALUES(?,?,?,?,?) ON CONFLICT(file) DO UPDATE SET key=excluded.key,captured_at=excluded.captured_at,checked_at=excluded.checked_at,bytes=excluded.bytes',body.file,hash,capturedAt,Date.now(),bytes.length)
   await env.DB.prepare('INSERT INTO storage_inventory VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET bytes=excluded.bytes,updated_at=excluded.updated_at').bind(`archive:${course}`,'archive',storage.sql.databaseSize,Date.now()).run()
   return {key:`shared:${course}:${hash}`,capturedAt,bytes:bytes.length}
  })();pending.set(body.file,task)
 }
 try{return Response.json(await task)}catch(e){return Response.json({error:e instanceof Error?e.message:'Не удалось сохранить документ'},{status:e instanceof PlatonusError&&e.expired?401:502})}finally{if(pending.get(body.file)===task)pending.delete(body.file)}
}
export async function storedDocument(env:Bindings,key:string){
 const match=key.match(/^shared:(\d{1,10}):([a-f0-9]{64})$/)
 if(!match)return env.ATTACHMENTS.get(key)
 const response=await sharedRequest(env,match[1],`blob/${match[2]}`)
 return response.ok&&response.body?{body:response.body}:null
}
