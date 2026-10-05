import type {Bindings} from '../types'
import {membership} from './routes'
import {notifyGroupWrite,scheduleState,scheduleWritePath} from '../services/schedule-notifications'
export const sharedPath=/^\/api\/(?:schedule(?:\/|$)|lessons\/|lesson-overrides(?:\/|$)|catalog(?:\/|$)|assistant(?:\/|$)|actions(?:\/|$)|homework(?:\/|$)|materials(?:\/|$)|history(?:\/|$)|changes(?:\/|$)|activity(?:\/|$)|attachments(?:\/|$)|teachers(?:\/|$))/
export function workspaceRequest(env:Bindings,owner:string,request:Request){const headers=new Headers(request.headers);headers.set('x-campus-owner',owner);headers.delete('cookie');headers.delete('authorization');headers.delete('x-campus-scope');return env.WORKSPACES.get(env.WORKSPACES.idFromName(owner)).fetch(new Request(request,{headers}))}
export async function groupForward(request:Request,env:Bindings,user:string,ctx?:{waitUntil(promise:Promise<unknown>):void}):Promise<Response|null>{
 const url=new URL(request.url),requested=request.headers.get('x-campus-scope')??(request.method==='GET'?url.searchParams.get('campus_scope'):null)
 if(!requested||requested==='personal'||!sharedPath.test(url.pathname))return null
 const m=await membership(env.DB,user)
 const fail=(message:string,status=403)=>Response.json({ok:false,error:{code:'GROUP_SCOPE',message}},{status})
 if(!m)return fail('Вы больше не состоите в группе. Обновите страницу.')
 if(requested==='all'){
  if(!['owner','head'].includes(m.role)||request.method!=='GET'||!['/api/schedule','/api/schedule/day'].includes(url.pathname))return fail('Сравнение доступно старосте только для просмотра расписания.')
  const subs=(await env.DB.prepare('SELECT id,name FROM study_subgroups WHERE group_id=? ORDER BY name').bind(m.group_id).all<{id:string;name:string}>()).results
  if(!subs.length){const headers=new Headers(request.headers);headers.set('x-campus-scope','common');return groupForward(new Request(request,{headers}),env,user)}
  const results=await Promise.all(subs.map(async sub=>{const headers=new Headers(request.headers);headers.set('x-campus-scope',sub.id);headers.delete('x-campus-personal-overlay');const response=await groupForward(new Request(request,{headers}),env,user);if(!response?.ok)throw new Error('Не удалось получить расписание подгруппы');return {sub,data:(await response.json() as any).data}}))
  const field=url.pathname==='/api/schedule/day'?'lessons':'slots',rows=new Map<string,any>()
  for(const {sub,data} of results)for(const lesson of data[field]){const key=lesson.scheduleSlotId??lesson.id;const existing=rows.get(key),mine=sub.id===m.subgroup_id||(!m.subgroup_id&&lesson.sourceScope==='common');if(existing){existing.audience.push(sub.name);existing.isMine ||= mine}else rows.set(key,{...lesson,audience:[sub.name],isMine:mine,sourceScope:lesson.sourceScope??sub.id})}
  return Response.json({ok:true,data:{...results[0].data,[field]:[...rows.values()].map(row=>({...row,audienceAll:row.audience.length===subs.length})),...(field==='slots'?{overrides:[]}:{} )}},{headers:{'cache-control':'no-store'}})
 }
 const scope=requested==='group'?(m.subgroup_id??'common'):requested
 if(scope!=='common'&&!await env.DB.prepare('SELECT id FROM study_subgroups WHERE id=? AND group_id=?').bind(scope,m.group_id).first())return fail('Подгруппа не найдена.')
 if(!['owner','head'].includes(m.role)&&scope!=='common'&&scope!==m.subgroup_id)return fail('Эта подгруппа вам недоступна.')
 const owner=`group:${m.group_id}:${scope}`,common=`group:${m.group_id}:common`
 const write=!['GET','HEAD'].includes(request.method)
 if(request.method==='PATCH'&&/^\/api\/homework\/[^/]+$/.test(url.pathname)){
  const body=await request.clone().json() as Record<string,unknown>
  if(Object.keys(body).length===1&&['open','done','archived'].includes(String(body.status))){
   const id=decodeURIComponent(url.pathname.split('/').at(-1)!)
   let found=false
   for(const workspace of [...new Set([owner,common])]){
    const check=await workspaceRequest(env,workspace,new Request(`https://workspace/internal/homework/${encodeURIComponent(id)}`))
    if(check.ok){found=true;break}
   }
   if(!found)return fail('Задание не найдено.',404)
   await env.DB.prepare('INSERT INTO group_homework_progress(account_id,group_id,homework_id,status) VALUES(?,?,?,?) ON CONFLICT(account_id,group_id,homework_id) DO UPDATE SET status=excluded.status').bind(user,m.group_id,id,body.status).run()
   return Response.json({ok:true,data:{id,status:body.status}})
  }
 }

 if(write){
  if(!['owner','head'].includes(m.role)&&!(m.role==='subhead'&&scope===m.subgroup_id))return fail('Изменять общее расписание может староста. Для личных записей выберите «Личное».')
  // Schedule writes are diffed (before/after) so affected members get a notification; failures here never fail the write.
  const before=scheduleWritePath.test(url.pathname)?await scheduleState(env,owner).catch(()=>null):null
  const response=await workspaceRequest(env,owner,request)
  if(response.ok)await env.DB.prepare('INSERT INTO group_events(id,group_id,actor_id,action) VALUES(?,?,?,?)').bind(crypto.randomUUID(),m.group_id,user,`${request.method} ${url.pathname} · ${scope}`).run()
  if(response.ok&&before){const task=notifyGroupWrite(env,m,scope,user,before).catch(()=>{});if(ctx)ctx.waitUntil(task);else await task}
  return response
 }
 const response=await workspaceRequest(env,owner,request.clone() as Request)
 const personalProgress=async(response:Response)=>{
  if(request.headers.get('x-campus-personal-overlay')==='1'&&['/api/schedule','/api/schedule/day'].includes(url.pathname)&&response.ok){
    const personal=await workspaceRequest(env,user,new Request(url))
    if(personal.ok){const group=await response.json() as any,own=await personal.json() as any
      if(url.pathname==='/api/schedule'){group.data.slots.push(...own.data.slots);group.data.overrides.push(...own.data.overrides)}
      else group.data.lessons.push(...own.data.lessons)
      return Response.json(group,{headers:{'cache-control':'no-store'}})
    }
  }

  if(url.pathname!=='/api/homework'||!response.ok)return response
  const json=await response.json() as any,progress=(await env.DB.prepare('SELECT homework_id,status FROM group_homework_progress WHERE account_id=? AND group_id=?').bind(user,m.group_id).all<{homework_id:string;status:string}>()).results
  if(Array.isArray(json.data))json.data=json.data.map((item:any)=>({...item,status:progress.find(p=>p.homework_id===item.id)?.status??item.status}))
  return Response.json(json,{headers:{'cache-control':'no-store'}})
 }
 if(scope==='common')return personalProgress(response)
 if(response.status===404&&(url.pathname.startsWith('/api/lessons/')||url.pathname.startsWith('/api/attachments/')||url.pathname.startsWith('/api/teachers/')))return workspaceRequest(env,common,request)
 if(!response.ok||!['/api/schedule','/api/schedule/day','/api/homework','/api/materials'].includes(url.pathname))return response
 const base=await workspaceRequest(env,common,request)
 if(!base.ok)return base
 const a=await response.json() as any,b=await base.json() as any
 if(['/api/schedule','/api/schedule/day'].includes(url.pathname)){
  const excluded=await (await workspaceRequest(env,owner,new Request('https://workspace/internal/group-exclusions'))).json() as string[]
  if(b.data.slots)b.data.slots=b.data.slots.filter((l:any)=>!excluded.includes(l.id))
  if(b.data.lessons)b.data.lessons=b.data.lessons.filter((l:any)=>!excluded.includes(l.scheduleSlotId))
 }

 const merge=(x:any[]=[],y:any[]=[])=>[...new Map([...x,...y].map(v=>[v.id??v.scheduleSlotId,v])).values()]
 if(Array.isArray(a.data)&&Array.isArray(b.data))a.data=merge(b.data,a.data)
 else if(url.pathname==='/api/schedule'){const subgroup=a.data.slots
 const commonSlots=b.data.slots.flatMap((base:any)=>{
  const types=base.weekType==='both'?['odd','even']:[base.weekType]
  const keep=types.filter((type:string)=>!subgroup.some((sub:any)=>sub.weekday===base.weekday&&(sub.weekType===type||sub.weekType==='both')&&(sub.slotNumber===base.slotNumber||(sub.startTime<base.endTime&&sub.endTime>base.startTime))))
  return keep.length===types.length?[base]:keep.map((type:string)=>({...base,weekType:type}))
 });a.data.slots=merge(commonSlots,subgroup);a.data.overrides=merge(b.data.overrides,a.data.overrides)}
 else if(url.pathname==='/api/schedule/day'){b.data.lessons=b.data.lessons.map((l:any)=>({...l,sourceScope:'common'}));a.data.lessons=a.data.lessons.map((l:any)=>({...l,sourceScope:scope}));a.data.lessons=merge(b.data.lessons.filter((base:any)=>!a.data.lessons.some((sub:any)=>sub.slotNumber===base.slotNumber||(sub.startTime<base.endTime&&sub.endTime>base.startTime))),a.data.lessons).sort((x:any,y:any)=>x.startTime.localeCompare(y.startTime))}
 return personalProgress(Response.json(a,{headers:{'cache-control':'no-store'}}))
}
