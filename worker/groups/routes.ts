import {workspaceRequest} from './forward'
import {publishGroupSchedule} from './source'
import {Hono} from 'hono'
import {z} from 'zod'
import type {Bindings} from '../types'
import {ok,apiError,validationError} from '../lib/api'
import {digest,randomToken} from '../auth/crypto'
export type GroupMember={account_id:string;group_id:string;role:'owner'|'head'|'subhead'|'member';subgroup_id:string|null;requested_subgroup_id:string|null}
export async function membership(db:D1Database,user:string){return db.prepare('SELECT * FROM group_members WHERE account_id=?').bind(user).first<GroupMember>()}
type GroupEnv={Bindings:Bindings;Variables:{user:{id:string;login:string;displayName:string};member:GroupMember}}
export const groupRoutes=new Hono<GroupEnv>()
const INVITE_DAYS=7,MAX_SUBGROUPS=20,MAX_ACTIVE_INVITES=20
/** Accepts a raw token, an upper-case copy or a whole pasted invite link; tokens are lower-case hex. */
export function normalizeInviteToken(raw:string){let value=raw.trim();const match=/[?&]invite=([^&#\s]+)/i.exec(value);if(match){try{value=decodeURIComponent(match[1])}catch{value=match[1]}}value=value.trim().toLowerCase();return /^[0-9a-f]{20,200}$/.test(value)?value:null}
const event=(db:D1Database,group:string,actor:string,action:string)=>db.prepare('INSERT INTO group_events(id,group_id,actor_id,action) VALUES(?,?,?,?)').bind(crypto.randomUUID(),group,actor,action)
const displayName=async(db:D1Database,id:string)=>(await db.prepare('SELECT display_name FROM accounts WHERE id=?').bind(id).first<{display_name:string}>())?.display_name??'участник'
const isConstraint=(e:unknown)=>/UNIQUE|PRIMARY KEY|constraint/i.test(String((e as Error)?.message??e))
// Removing a member also drops their schedule-source assignments and private homework progress for this group.
const detach=(db:D1Database,group:string,account:string)=>[...['group_sources','group_homework_progress'].map(table=>db.prepare(`DELETE FROM ${table} WHERE group_id=? AND account_id=? AND EXISTS(SELECT 1 FROM group_members WHERE account_id=? AND group_id=? AND role<>'owner')`).bind(group,account,account,group)),db.prepare("DELETE FROM group_members WHERE account_id=? AND group_id=? AND role<>'owner'").bind(account,group)]
async function platonusGroupOf(db:D1Database,account:string){try{return (await db.prepare('SELECT platonus_group FROM account_profiles WHERE account_id=?').bind(account).first<{platonus_group:string|null}>())?.platonus_group?.trim()||null}catch{return null}}
groupRoutes.get('/api/groups',async c=>{
 const user=c.get('user').id,db=c.env.DB,member=await membership(db,user)
 const onboard=await db.prepare('SELECT completed FROM account_onboarding WHERE account_id=?').bind(user).first<{completed:number}>()
 if(!member){
  // Suggest the student's Platonus group. Existence is reported without revealing ids: joining still requires an invite.
  const platonusGroup=await platonusGroupOf(db,user)
  const exists=!!platonusGroup&&!!await db.prepare('SELECT 1 FROM study_groups g WHERE g.name=? OR EXISTS(SELECT 1 FROM group_members m JOIN account_profiles p ON p.account_id=m.account_id WHERE m.group_id=g.id AND p.platonus_group=?) LIMIT 1').bind(platonusGroup,platonusGroup).first().catch(()=>null)
  return ok(c,{group:null,onboarding:onboard?.completed===0,suggestion:platonusGroup?{name:platonusGroup,exists}:null})
 }
 const group=await db.prepare('SELECT * FROM study_groups WHERE id=?').bind(member.group_id).first()
 const subgroups=(await db.prepare('SELECT id,name FROM study_subgroups WHERE group_id=? ORDER BY name').bind(member.group_id).all()).results
 const members=(await db.prepare('SELECT m.account_id AS id,a.display_name AS name,m.role,m.subgroup_id AS subgroupId,m.requested_subgroup_id AS requestedSubgroupId FROM group_members m JOIN accounts a ON a.id=m.account_id WHERE m.group_id=? ORDER BY a.display_name').bind(member.group_id).all()).results
 const notices=(await db.prepare('SELECT scope,changed FROM group_schedule_notices WHERE group_id=? AND changed=1').bind(member.group_id).all()).results
 const platonusGroup=await db.prepare('SELECT p.platonus_group AS name,count(*) AS n FROM group_members m JOIN account_profiles p ON p.account_id=m.account_id WHERE m.group_id=? AND p.platonus_group IS NOT NULL AND p.platonus_group<>\'\' GROUP BY p.platonus_group ORDER BY n DESC,name LIMIT 1').bind(member.group_id).first<{name:string}>().catch(()=>null)
 const invites=['owner','head'].includes(member.role)?await db.prepare('SELECT count(*) AS active,max(expires_at) AS expiresAt FROM group_invites WHERE group_id=? AND revoked=0 AND expires_at>?').bind(member.group_id,Date.now()).first<{active:number;expiresAt:number|null}>():null
 return ok(c,{group,member,subgroups,members,notices,onboarding:false,platonusGroup:platonusGroup?.name??null,...(invites?{invites}:{})})
})
groupRoutes.post('/api/onboarding',async c=>{await c.env.DB.prepare('INSERT INTO account_onboarding(account_id,completed) VALUES(?,1) ON CONFLICT(account_id) DO UPDATE SET completed=1').bind(c.get('user').id).run();return ok(c,{completed:true})})
groupRoutes.post('/api/groups',async c=>{
 const p=z.object({name:z.string().trim().min(2).max(100)}).strict().safeParse(await c.req.json().catch(()=>null));if(!p.success)return validationError(c,p.error)
 const user=c.get('user').id,db=c.env.DB;if(await membership(db,user))return apiError(c,409,'ALREADY_MEMBER','Сначала выйдите из текущей группы.')
 const id=crypto.randomUUID()
 try{await db.batch([db.prepare('INSERT INTO study_groups(id,name,owner_id) VALUES(?,?,?)').bind(id,p.data.name,user),db.prepare("INSERT INTO group_members(account_id,group_id,role) VALUES(?,?,'owner')").bind(user,id),...['Подгруппа 1','Подгруппа 2'].map(name=>db.prepare('INSERT INTO study_subgroups(id,group_id,name) VALUES(?,?,?)').bind(crypto.randomUUID(),id,name)),db.prepare('INSERT INTO account_onboarding(account_id,completed) VALUES(?,1) ON CONFLICT(account_id) DO UPDATE SET completed=1').bind(user),event(db,id,user,'Группа создана')])}
 catch(e){if(isConstraint(e))return apiError(c,409,'ALREADY_MEMBER','Вы уже состоите в группе. Обновите страницу.');throw e}
 return ok(c,{id},201)
})
groupRoutes.post('/api/groups/join',async c=>{
 const p=z.object({token:z.string().min(20).max(2000)}).strict().safeParse(await c.req.json().catch(()=>null));if(!p.success)return validationError(c,p.error)
 const token=normalizeInviteToken(p.data.token);if(!token)return apiError(c,400,'INVITE_INVALID','Ссылка приглашения повреждена. Скопируйте её целиком.')
 const db=c.env.DB,user=c.get('user').id;if(await membership(db,user))return apiError(c,409,'ALREADY_MEMBER','Вы уже состоите в группе. Чтобы перейти в другую, сначала выйдите из текущей.')
 let row:{group_id:string}|null
 try{row=await db.prepare("INSERT INTO group_members(account_id,group_id,role) SELECT ?,group_id,'member' FROM group_invites WHERE token_hash=? AND revoked=0 AND expires_at>? RETURNING group_id").bind(user,await digest(token),Date.now()).first<{group_id:string}>()}
 catch(e){if(isConstraint(e))return apiError(c,409,'ALREADY_MEMBER','Вы уже состоите в группе.');throw e}
 if(!row)return apiError(c,410,'INVITE_EXPIRED','Приглашение истекло или отключено. Попросите новую ссылку у старосты.')
 await db.batch([db.prepare('INSERT INTO account_onboarding(account_id,completed) VALUES(?,1) ON CONFLICT(account_id) DO UPDATE SET completed=1').bind(user),event(db,row.group_id,user,`Вступил(а) ${c.get('user').displayName}`)])
 return ok(c,row)
})
groupRoutes.post('/api/groups/subgroup-request',async c=>{
 const p=z.object({id:z.uuid()}).safeParse(await c.req.json().catch(()=>null));if(!p.success)return validationError(c,p.error)
 const db=c.env.DB,user=c.get('user').id,m=await membership(db,user)
 if(!m||!await db.prepare('SELECT id FROM study_subgroups WHERE id=? AND group_id=?').bind(p.data.id,m.group_id).first())return apiError(c,404,'SUBGROUP_NOT_FOUND','Подгруппа не найдена.')
 if(m.subgroup_id===p.data.id){await db.prepare('UPDATE group_members SET requested_subgroup_id=NULL WHERE account_id=?').bind(user).run();return ok(c,{requested:false})}
 await db.prepare('UPDATE group_members SET requested_subgroup_id=? WHERE account_id=?').bind(p.data.id,user).run();return ok(c,{requested:true})
})
groupRoutes.post('/api/groups/leave',async c=>{
 const db=c.env.DB,user=c.get('user').id,m=await membership(db,user)
 if(!m)return apiError(c,404,'NOT_MEMBER','Вы не состоите в группе. Обновите страницу.')
 if(m.role==='owner'){const others=await db.prepare('SELECT count(*) AS n FROM group_members WHERE group_id=? AND account_id<>?').bind(m.group_id,user).first<{n:number}>();return apiError(c,409,'TRANSFER_REQUIRED',others?.n?'Передайте владение группой другому участнику перед выходом.':'Вы единственный участник. Удалите группу или пригласите участника и передайте ему владение.')}
 await db.batch([...detach(db,m.group_id,user),event(db,m.group_id,user,`Вышел(а) ${c.get('user').displayName}`)]);return ok(c,{left:true})
})
groupRoutes.use('/api/groups/admin/*',async(c,next)=>{const m=await membership(c.env.DB,c.get('user').id);if(!m||!['owner','head'].includes(m.role))return apiError(c,403,'GROUP_FORBIDDEN','Управление группой доступно владельцу и старосте.');c.set('member',m);await next()})
groupRoutes.post('/api/groups/admin/invite',async c=>{
 const db=c.env.DB,m=c.get('member'),token=randomToken(),now=Date.now(),body=await c.req.json().catch(()=>({})) as {replace?:unknown}
 const active=await db.prepare('SELECT count(*) AS n FROM group_invites WHERE group_id=? AND revoked=0 AND expires_at>?').bind(m.group_id,now).first<{n:number}>()
 if(body?.replace!==true&&(active?.n??0)>=MAX_ACTIVE_INVITES)return apiError(c,429,'INVITE_LIMIT','Слишком много действующих приглашений. Отключите старые ссылки и создайте новую.')
 // Expired and revoked hashes are useless; prune them so the table does not grow with every regenerate.
 await db.batch([db.prepare('DELETE FROM group_invites WHERE group_id=? AND (revoked=1 OR expires_at<=?)').bind(m.group_id,now),...(body?.replace===true?[db.prepare('UPDATE group_invites SET revoked=1 WHERE group_id=?').bind(m.group_id)]:[]),db.prepare('INSERT INTO group_invites(token_hash,group_id,expires_at) VALUES(?,?,?)').bind(await digest(token),m.group_id,now+INVITE_DAYS*86400000),event(db,m.group_id,c.get('user').id,body?.replace===true?'Создано новое приглашение, старые ссылки отключены':'Создано приглашение')])
 return ok(c,{url:`${c.env.PUBLIC_APP_URL}/?invite=${encodeURIComponent(token)}`,code:token,expiresInDays:INVITE_DAYS,expiresAt:now+INVITE_DAYS*86400000})
})
groupRoutes.delete('/api/groups/admin/invites',async c=>{const db=c.env.DB,m=c.get('member');const r=await db.prepare('UPDATE group_invites SET revoked=1 WHERE group_id=? AND revoked=0').bind(m.group_id).run();await event(db,m.group_id,c.get('user').id,'Все приглашения отключены').run();return ok(c,{revoked:true,count:r.meta.changes??0})})
groupRoutes.patch('/api/groups/admin/group',async c=>{
 const p=z.object({name:z.string().trim().min(2).max(100)}).strict().safeParse(await c.req.json().catch(()=>null));if(!p.success)return validationError(c,p.error)
 const db=c.env.DB,m=c.get('member');await db.batch([db.prepare('UPDATE study_groups SET name=? WHERE id=?').bind(p.data.name,m.group_id),event(db,m.group_id,c.get('user').id,`Группа переименована в «${p.data.name}»`)]);return ok(c,{updated:true})
})
groupRoutes.post('/api/groups/admin/subgroups',async c=>{
 const p=z.object({name:z.string().trim().min(1).max(80)}).safeParse(await c.req.json().catch(()=>null));if(!p.success)return validationError(c,p.error)
 const db=c.env.DB,m=c.get('member'),id=crypto.randomUUID()
 const existing=(await db.prepare('SELECT name FROM study_subgroups WHERE group_id=?').bind(m.group_id).all<{name:string}>()).results
 if(existing.some(s=>s.name.toLocaleLowerCase('ru')===p.data.name.toLocaleLowerCase('ru')))return apiError(c,409,'DUPLICATE_NAME','Подгруппа с таким названием уже существует.')
 if(existing.length>=MAX_SUBGROUPS)return apiError(c,409,'SUBGROUP_LIMIT',`В группе может быть не больше ${MAX_SUBGROUPS} подгрупп.`)
 await db.batch([db.prepare('INSERT INTO study_subgroups(id,group_id,name) VALUES(?,?,?)').bind(id,m.group_id,p.data.name),event(db,m.group_id,c.get('user').id,`Добавлена подгруппа «${p.data.name}»`)]);return ok(c,{id})
})
groupRoutes.patch('/api/groups/admin/members/:id',async c=>{
 const p=z.object({role:z.enum(['head','subhead','member']),subgroupId:z.uuid().nullable()}).strict().safeParse(await c.req.json().catch(()=>null));if(!p.success)return validationError(c,p.error)
 const db=c.env.DB,m=c.get('member'),id=c.req.param('id'),target=await membership(db,id)
 if(!target||target.group_id!==m.group_id)return apiError(c,404,'NOT_FOUND','Участник не найден.')
 if(target.role==='owner')return apiError(c,403,'ROLE_FORBIDDEN','Роль владельца меняется только передачей владения.')
 if(m.role!=='owner'&&(p.data.role!==target.role||target.role==='head'))return apiError(c,403,'ROLE_FORBIDDEN','Изменять роли может только владелец группы.')
 if(p.data.role==='subhead'&&!p.data.subgroupId)return apiError(c,400,'SUBGROUP_REQUIRED','Выберите подгруппу ответственного.')
 if(p.data.subgroupId&&!await db.prepare('SELECT id FROM study_subgroups WHERE id=? AND group_id=?').bind(p.data.subgroupId,m.group_id).first())return apiError(c,400,'SUBGROUP_INVALID','Подгруппа не принадлежит этой группе.')
 const labels:Record<string,string>={head:'староста',subhead:'ответственный за подгруппу',member:'участник'},name=await displayName(db,id)
 // Conditions on role guard against a concurrent ownership transfer to this member.
 const r=await db.batch([db.prepare("UPDATE group_members SET role=?,subgroup_id=?,requested_subgroup_id=NULL WHERE account_id=? AND group_id=? AND role<>'owner'").bind(p.data.role,p.data.subgroupId,id,m.group_id),event(db,m.group_id,c.get('user').id,p.data.role===target.role?`Изменена подгруппа: ${name}`:`${name}: роль «${labels[p.data.role]}»`)])
 if(!r[0].meta.changes)return apiError(c,409,'MEMBER_CHANGED','Участник изменился. Обновите страницу.')
 return ok(c,{updated:true})
})
groupRoutes.post('/api/groups/admin/transfer/:id',async c=>{
 const db=c.env.DB,user=c.get('user').id,m=c.get('member'),target=c.req.param('id'),g=m.group_id
 if(m.role!=='owner')return apiError(c,403,'TRANSFER_FORBIDDEN','Передать владение может только владелец группы.')
 if(target===user||!await db.prepare('SELECT account_id FROM group_members WHERE account_id=? AND group_id=?').bind(target,g).first())return apiError(c,404,'TRANSFER_TARGET','Выберите другого участника своей группы.')
 // One atomic batch: every statement re-checks that the caller is still the owner and the target is still a member.
 const r=await db.batch([
  db.prepare("UPDATE study_groups SET owner_id=? WHERE id=? AND EXISTS(SELECT 1 FROM group_members WHERE account_id=? AND group_id=?) AND EXISTS(SELECT 1 FROM group_members WHERE account_id=? AND group_id=? AND role='owner')").bind(target,g,target,g,user,g),
  db.prepare("UPDATE group_members SET role='head' WHERE account_id=? AND group_id=? AND role='owner' AND (SELECT owner_id FROM study_groups WHERE id=?)=?").bind(user,g,g,target),
  db.prepare("UPDATE group_members SET role='owner',requested_subgroup_id=NULL WHERE account_id=? AND group_id=? AND (SELECT owner_id FROM study_groups WHERE id=?)=?").bind(target,g,g,target),
 ])
 if(!r[2].meta.changes)return apiError(c,409,'TRANSFER_CONFLICT','Состав группы изменился. Обновите страницу и повторите.')
 await event(db,g,user,`Владение передано: ${await displayName(db,target)}`).run()
 return ok(c,{transferred:true})
})
// Sources publish schedule fields only; credentials, grades and UMKD stay in the personal workspace.
groupRoutes.post('/api/groups/schedule/source',async c=>{
 const m=await membership(c.env.DB,c.get('user').id),scope=c.req.header('x-campus-scope')==='group'?(m?.subgroup_id??'common'):c.req.header('x-campus-scope')
 if(!m||!scope||scope==='personal'||!(['owner','head'].includes(m.role)||(m.role==='subhead'&&scope===m.subgroup_id)))return apiError(c,403,'SOURCE_FORBIDDEN','Выберите общие занятия или свою подгруппу. Назначать источник может староста.')
 if(scope!=='common'&&!await c.env.DB.prepare('SELECT id FROM study_subgroups WHERE id=? AND group_id=?').bind(scope,m.group_id).first())return apiError(c,400,'SCOPE_INVALID','Подгруппа не найдена.')
 const result=await workspaceRequest(c.env,c.get('user').id,new Request('https://workspace/api/platonus'))
 const json=await result.json() as any
 if(!result.ok||!json.data?.snapshot)return apiError(c,409,'SOURCE_EMPTY','Сначала подключите Platonus и получите своё расписание в настройках.')
 await c.env.DB.prepare('INSERT INTO group_sources(group_id,scope,account_id) VALUES(?,?,?) ON CONFLICT(group_id,scope) DO UPDATE SET account_id=excluded.account_id').bind(m.group_id,scope,c.get('user').id).run()
 await publishGroupSchedule({...c.env,REGISTRY:c.env.DB},c.get('user').id,json.data.snapshot)
 return ok(c,{connected:true})
})
groupRoutes.on(['GET','POST'],'/api/groups/schedule/:operation',async c=>{
 const m=await membership(c.env.DB,c.get('user').id),scope=c.req.header('x-campus-scope')==='group'?(m?.subgroup_id??'common'):c.req.header('x-campus-scope')
 if(!m||!scope||scope==='personal')return apiError(c,400,'SCOPE_REQUIRED','Выберите расписание группы.')
 if(scope!=='common'&&!await c.env.DB.prepare('SELECT id FROM study_subgroups WHERE id=? AND group_id=?').bind(scope,m.group_id).first())return apiError(c,403,'SCOPE_INVALID','Подгруппа не найдена.')
 if(!['owner','head'].includes(m.role)&&scope!=='common'&&scope!==m.subgroup_id)return apiError(c,403,'SCOPE_FORBIDDEN','Подгруппа недоступна.')
 const op=c.req.param('operation');if(!['preview','import','acknowledge'].includes(op))return c.notFound()
 const admin=['owner','head'].includes(m.role)||(m.role==='subhead'&&scope===m.subgroup_id)
 if(c.req.method==='POST'&&!admin)return apiError(c,403,'GROUP_READ_ONLY','Применить изменения может староста.')
 if(op==='acknowledge'){if(c.req.method!=='POST')return c.notFound();await c.env.DB.prepare('UPDATE group_schedule_notices SET changed=0 WHERE group_id=? AND scope=?').bind(m.group_id,scope).run();return ok(c,{acknowledged:true})}
 if((op==='preview')!==(c.req.method==='GET'))return c.notFound()
 const owner=`group:${m.group_id}:${scope}`,url=new URL(c.req.url);url.pathname=op==='preview'?'/api/platonus':'/api/platonus/import'
 return workspaceRequest(c.env,owner,new Request(url,c.req.raw))
})

groupRoutes.get('/api/groups/invitation/:token',async c=>{
 const token=normalizeInviteToken(c.req.param('token'))
 const row=token?await c.env.DB.prepare('SELECT g.name,(SELECT count(*) FROM group_members WHERE group_id=g.id) AS members FROM group_invites i JOIN study_groups g ON g.id=i.group_id WHERE i.token_hash=? AND i.revoked=0 AND i.expires_at>?').bind(await digest(token),Date.now()).first():null
 return row?ok(c,row):apiError(c,410,'INVITE_EXPIRED','Приглашение истекло или отключено. Попросите новую ссылку у старосты.')
})
groupRoutes.delete('/api/groups',async c=>{
 const m=await membership(c.env.DB,c.get('user').id),body=await c.req.json().catch(()=>null)
 if(!m||m.role!=='owner')return apiError(c,403,'OWNER_REQUIRED','Удалить группу может только владелец.')
 const group=await c.env.DB.prepare('SELECT name FROM study_groups WHERE id=?').bind(m.group_id).first<{name:string}>()
 if(typeof body?.name!=='string'||body.name.trim()!==group?.name.trim())return apiError(c,400,'CONFIRM_NAME','Введите название группы для подтверждения удаления.')
 const scopes=(await c.env.DB.prepare('SELECT id FROM study_subgroups WHERE group_id=?').bind(m.group_id).all<{id:string}>()).results.map(s=>s.id)
 await c.env.DB.batch([c.env.DB.prepare('DELETE FROM group_schedule_notices WHERE group_id=?').bind(m.group_id),c.env.DB.prepare('DELETE FROM study_groups WHERE id=?').bind(m.group_id)])
 for(const scope of ['common',...scopes]){const owner=`group:${m.group_id}:${scope}`;const r=await workspaceRequest(c.env,owner,new Request('https://workspace/internal/delete',{method:'DELETE'})).catch(()=>null);if(!r?.ok)console.error('Deleted group workspace cleanup failed',owner)}
 return ok(c,{deleted:true})
})
groupRoutes.delete('/api/groups/admin/members/:id',async c=>{
 const db=c.env.DB,m=c.get('member'),id=c.req.param('id'),target=await membership(db,id)
 if(!target||target.group_id!==m.group_id)return apiError(c,404,'NOT_FOUND','Участник не найден.')
 if(id===c.get('user').id)return apiError(c,400,'USE_LEAVE','Чтобы покинуть группу, используйте «Выйти из группы».')
 if(target.role==='owner'||(m.role!=='owner'&&target.role==='head'))return apiError(c,403,'REMOVE_FORBIDDEN','У вас нет права удалить этого участника.')
 const name=await displayName(db,id),r=await db.batch([...detach(db,m.group_id,id),event(db,m.group_id,c.get('user').id,`Удалён(а) из группы: ${name}`)])
 if(!r[2].meta.changes)return apiError(c,409,'MEMBER_CHANGED','Участник изменился. Обновите страницу.')
 return ok(c,{removed:true})
})

// Only the assigned group's UMKD is shared; never forward login, grades or arbitrary URLs.
groupRoutes.get('/api/groups/umkd/:course?/:part?/:file?',async c=>{
 const m=await membership(c.env.DB,c.get('user').id)
 if(!m)return apiError(c,403,'GROUP_REQUIRED','Вступите в учебную группу.')
 const source=await c.env.DB.prepare(`SELECT s.account_id FROM group_sources s JOIN group_members owner ON owner.account_id=s.account_id AND owner.group_id=s.group_id WHERE s.group_id=? AND (s.scope='common' OR s.scope=?) AND (owner.role IN ('owner','head') OR (owner.role='subhead' AND owner.subgroup_id=s.scope)) ORDER BY CASE WHEN s.scope=? THEN 0 ELSE 1 END LIMIT 1`).bind(m.group_id,m.subgroup_id??'common',m.subgroup_id??'common').first<{account_id:string}>()
 if(!source)return c.req.param('course')?apiError(c,404,'SOURCE_MISSING','Староста ещё не подключил источник УМКД.'):ok(c,{section:null,capturedAt:null,source:'group'})
 const course=c.req.param('course'),part=c.req.param('part'),file=c.req.param('file')
 if((course&&!/^\d{1,10}$/.test(course))||(course&&part!=='files')||(file&&!/^\d{1,10}$/.test(file)))return apiError(c,404,'NOT_FOUND','Документ не найден.')
 const path=course?`/api/platonus/umkd/${course}/files${file?'/'+file:''}`:'/api/platonus/umkd'
 const response=await workspaceRequest(c.env,source.account_id,new Request('https://workspace'+path+(c.req.query('download')==='1'?'?download=1':'')))
 return response
})

groupRoutes.on(['GET','POST'],'/api/groups/exclusions',async c=>{
 const m=await membership(c.env.DB,c.get('user').id),requested=c.req.header('x-campus-scope'),scope=requested==='group'?m?.subgroup_id:requested
 if(!m||!scope||scope==='common'||!await c.env.DB.prepare('SELECT id FROM study_subgroups WHERE id=? AND group_id=?').bind(scope,m.group_id).first())return apiError(c,400,'SUBGROUP_REQUIRED','Выберите подгруппу.')
 if(!['owner','head'].includes(m.role)&&scope!==m.subgroup_id)return apiError(c,403,'GROUP_FORBIDDEN','Подгруппа недоступна.')
 const catalogResponse=await workspaceRequest(c.env,`group:${m.group_id}:common`,new Request('https://workspace/api/catalog'))
 const catalog=catalogResponse.ok?(await catalogResponse.json() as any).data:null
 if(!catalog?.slots)return apiError(c,502,'CATALOG_UNAVAILABLE','Не удалось загрузить занятия для всех. Повторите позже.')
 if(c.req.method==='POST'){
  if(!['owner','head','subhead'].includes(m.role))return apiError(c,403,'GROUP_FORBIDDEN','Расписание меняет староста.')
  const body=z.object({slotId:z.string().min(1).max(200),hidden:z.boolean()}).strict().safeParse(await c.req.json());if(!body.success)return validationError(c,body.error)
  if(!catalog.slots.some((s:any)=>s.id===body.data.slotId))return apiError(c,404,'NOT_FOUND','Занятие для всех не найдено.')
  const result=await workspaceRequest(c.env,`group:${m.group_id}:${scope}`,new Request('https://workspace/internal/group-exclusions',{method:'POST',body:JSON.stringify(body.data)}))
  await c.env.DB.prepare('INSERT INTO group_events(id,group_id,actor_id,action) VALUES(?,?,?,?)').bind(crypto.randomUUID(),m.group_id,c.get('user').id,`${body.data.hidden?'Исключено':'Возвращено'} занятие ${body.data.slotId} для подгруппы ${scope}`).run()
  return ok(c,{ids:await result.json()})
 }
 const result=await workspaceRequest(c.env,`group:${m.group_id}:${scope}`,new Request('https://workspace/internal/group-exclusions'))
 return ok(c,{ids:await result.json(),catalog})
})
groupRoutes.patch('/api/groups/admin/members/:id/subgroup',async c=>{
 const db=c.env.DB,m=c.get('member'),id=c.req.param('id'),target=await membership(db,id)
 const body=z.object({subgroupId:z.uuid().nullable()}).strict().safeParse(await c.req.json().catch(()=>null));if(!body.success)return validationError(c,body.error)
 if(!target||target.group_id!==m.group_id)return apiError(c,404,'NOT_FOUND','Участник не найден.')
 if(m.role!=='owner'&&id!==c.get('user').id&&['owner','head'].includes(target.role))return apiError(c,403,'ROLE_FORBIDDEN','Подгруппу владельца и других старост меняет владелец группы.')
 if(target.role==='subhead'&&!body.data.subgroupId)return apiError(c,400,'SUBGROUP_REQUIRED','У ответственного за подгруппу должна быть подгруппа. Сначала смените его роль.')
 if(body.data.subgroupId&&!await db.prepare('SELECT id FROM study_subgroups WHERE id=? AND group_id=?').bind(body.data.subgroupId,m.group_id).first())return apiError(c,400,'SUBGROUP_INVALID','Подгруппа недоступна.')
 await db.prepare('UPDATE group_members SET subgroup_id=?,requested_subgroup_id=NULL WHERE account_id=? AND group_id=?').bind(body.data.subgroupId,id,m.group_id).run()
 return ok(c,{updated:true})
})
groupRoutes.patch('/api/groups/admin/subgroups/:id',async c=>{
 const m=c.get('member')
 const body=z.object({name:z.string().trim().min(1).max(80)}).strict().safeParse(await c.req.json());if(!body.success)return validationError(c,body.error)
 const duplicate=await c.env.DB.prepare('SELECT id FROM study_subgroups WHERE group_id=? AND name=? AND id<>?').bind(m.group_id,body.data.name,c.req.param('id')).first()
 if(duplicate)return apiError(c,409,'DUPLICATE_NAME','Подгруппа с таким названием уже существует.')
 const result=await c.env.DB.prepare('UPDATE study_subgroups SET name=? WHERE id=? AND group_id=?').bind(body.data.name,c.req.param('id'),m.group_id).run()
 if(!result.meta.changes)return apiError(c,404,'NOT_FOUND','Подгруппа не найдена.')
 return ok(c,{updated:true})
})
groupRoutes.delete('/api/groups/admin/subgroups/:id',async c=>{
 const m=c.get('member'),id=c.req.param('id')
 const body=z.object({name:z.string().trim().min(1).max(80)}).strict().safeParse(await c.req.json().catch(()=>null));if(!body.success)return validationError(c,body.error)
 const subgroup=await c.env.DB.prepare('SELECT name FROM study_subgroups WHERE id=? AND group_id=?').bind(id,m.group_id).first<{name:string}>()
 if(!subgroup)return apiError(c,404,'SUBGROUP_NOT_FOUND','Подгруппа уже удалена или недоступна.')
 if(body.data.name!==subgroup.name)return apiError(c,400,'NAME_MISMATCH','Введите точное название подгруппы для подтверждения.')
 const results=await c.env.DB.batch([
  c.env.DB.prepare('UPDATE group_members SET requested_subgroup_id=NULL WHERE group_id=? AND requested_subgroup_id=? AND NOT EXISTS(SELECT 1 FROM group_members WHERE subgroup_id=?)').bind(m.group_id,id,id),
  c.env.DB.prepare('DELETE FROM study_subgroups WHERE id=? AND group_id=? AND name=? AND NOT EXISTS(SELECT 1 FROM group_members WHERE subgroup_id=?)').bind(id,m.group_id,body.data.name,id),
  c.env.DB.prepare('DELETE FROM group_sources WHERE group_id=? AND scope=? AND NOT EXISTS(SELECT 1 FROM study_subgroups WHERE id=?)').bind(m.group_id,id,id),
  c.env.DB.prepare('DELETE FROM group_schedule_notices WHERE group_id=? AND scope=? AND NOT EXISTS(SELECT 1 FROM study_subgroups WHERE id=?)').bind(m.group_id,id,id),
 ])
 if(!results[1].meta.changes)return apiError(c,409,'SUBGROUP_HAS_MEMBERS','В подгруппе есть участники. Назначьте им другую подгруппу в разделе «Участники», затем повторите удаление.')
 await c.env.DB.prepare('INSERT INTO group_events(id,group_id,actor_id,action) VALUES(?,?,?,?)').bind(crypto.randomUUID(),m.group_id,c.get('user').id,`Удалена подгруппа «${subgroup.name}»`).run()
 // Revoke access in the registry before clearing this subgroup's isolated workspace.
 const response=await workspaceRequest(c.env,`group:${m.group_id}:${id}`,new Request('https://workspace/internal/delete',{method:'DELETE'}))
 if(!response.ok)console.error('Deleted subgroup workspace cleanup failed',id)
 return ok(c,{deleted:true})
})

groupRoutes.get('/api/onboarding',async c=>{
 const row=await c.env.DB.prepare('SELECT completed FROM account_onboarding WHERE account_id=?').bind(c.get('user').id).first<{completed:number}>()
 return ok(c,{onboarding:row?.completed===0})
})
