import { Hono } from 'hono'
import { ok,rowNotFound,apiError } from '../lib/api'
import { allowedProfileUrl,fetchProfileHtml,parseTeacherCandidates,parseTeacherProfile } from '../services/teacher-profile'
import type { Bindings } from '../types'
export const teacherRoutes=new Hono<{Bindings:Bindings}>().get('/teachers/:id/profile',async c=>{
 const teacher=await c.env.DB.prepare('SELECT name FROM teachers WHERE id=?').bind(c.req.param('id')).first<{name:string}>();if(!teacher)return rowNotFound(c,'Преподаватель')
 const cached=await c.env.DB.prepare("SELECT value_json FROM teacher_profiles WHERE teacher_id=? AND teacher_name=? AND julianday(fetched_at)>julianday('now','-1 day')").bind(c.req.param('id'),teacher.name).first<{value_json:string}>()
 const chosen=c.req.query('url')
 if(cached&&!chosen){const value=JSON.parse(cached.value_json);if(value.nameMatcherVersion===2)return ok(c,value)}
 try{
   const searchUrl=`https://person.kstu.kz/?s=${encodeURIComponent(teacher.name.trim().split(/\s/)[0])}`
   const candidates=await parseTeacherCandidates(await fetchProfileHtml(searchUrl),teacher.name)
   let value:unknown={candidates,profile:null,searchUrl}
   const selected=chosen?candidates.find(c=>c.url===chosen):candidates.length===1?candidates[0]:undefined
   if(chosen&&!selected)return apiError(c,400,'PROFILE_MISMATCH','Страница не соответствует найденным профилям преподавателя')
   if(selected)value={candidates,profile:await parseTeacherProfile(await fetchProfileHtml(selected.url),selected.url),searchUrl}
   await c.env.DB.prepare("INSERT INTO teacher_profiles(teacher_id,teacher_name,value_json) VALUES(?,?,?) ON CONFLICT(teacher_id) DO UPDATE SET teacher_name=excluded.teacher_name,value_json=excluded.value_json,fetched_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(c.req.param('id'),teacher.name,JSON.stringify({...value as Record<string,unknown>,nameMatcherVersion:2})).run()
   return ok(c,value)
 }catch{return apiError(c,502,'UNIVERSITY_UNAVAILABLE','Не удалось загрузить данные университета. Попробуйте ещё раз позже.')}
})

teacherRoutes.get('/teachers/:id/photo',async c=>{
 const cached=await c.env.DB.prepare('SELECT p.value_json FROM teacher_profiles p JOIN teachers t ON t.id=p.teacher_id AND t.name=p.teacher_name WHERE p.teacher_id=?').bind(c.req.param('id')).first<{value_json:string}>()
 const photo=cached?JSON.parse(cached.value_json).profile?.photo:null
 const url=typeof photo==='string'?allowedProfileUrl(photo):null
 if(!url)return rowNotFound(c,'Фото')
 try{
   let response:Response|null=null
   for(const address of [url,url.replace(/^https:/,'http:')]){
     try{const result=await fetch(address,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{accept:'image/*'}})
       if(result.ok){response=result;break}
       await result.body?.cancel()
     }catch{/* Older university image URLs sometimes support HTTP only. Public image data only. */}
   }
   if(!response)throw new Error('PHOTO_UNAVAILABLE')
   const reader=response.body!.getReader(),chunks:Uint8Array[]=[];let size=0
   try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>2*1024*1024)throw new Error('PHOTO_TOO_LARGE');chunks.push(part.value)}}finally{await reader.cancel().catch(()=>{})}
   const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length}
   const type=bytes[0]===0xff&&bytes[1]===0xd8?'image/jpeg':bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47?'image/png':new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP'?'image/webp':null
   if(!type)throw new Error('PHOTO_INVALID')
   return new Response(bytes,{headers:{'content-type':type,'cache-control':'private, max-age=3600','x-content-type-options':'nosniff'}})
 }catch{return apiError(c,502,'PHOTO_UNAVAILABLE','Фото университета временно недоступно')}
})
