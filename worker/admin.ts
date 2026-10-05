import {FEATURES,accountFeatures} from './permissions'
import {Hono} from 'hono'
import {z} from 'zod'
import {getCookie,setCookie,deleteCookie} from 'hono/cookie'
import type {Bindings} from './types'
import {digest,randomToken} from './auth/crypto'
import {telegram} from './support'
import {ok,apiError,validationError} from './lib/api'
import {membership} from './groups/routes'
import {studentName} from '../src/lib/person-name'
type NameRow={login:string;display_name?:string|null;displayName?:string|null;platonus_name?:string|null;platonus_login?:string|null}
const named=<T extends NameRow>(row:T)=>{const {name,source}=studentName({login:row.login,displayName:row.display_name??row.displayName,platonusName:row.platonus_name,platonusLogin:row.platonus_login});return {...row,name,nameSource:source}}

export const adminRoutes=new Hono<{Bindings:Bindings;Variables:{user:{id:string}}}>()
adminRoutes.use('/api/admin/*',async(c,next)=>{
 if(!c.env.ADMIN_ACCOUNT_ID||c.get('user').id!==c.env.ADMIN_ACCOUNT_ID)return apiError(c,403,'ADMIN_FORBIDDEN','Доступ запрещён')
 await next()
})
adminRoutes.post('/api/admin/code',async c=>{
 const chat=await c.env.DB.prepare('SELECT chat_id FROM support_config WHERE id=1').first<{chat_id:string}>()
 if(!chat||!c.env.SUPPORT_BOT_TOKEN)return apiError(c,503,'ADMIN_SETUP','Сначала привяжите Telegram-бота разработчика по личной ссылке.')
 const account=c.get('user').id,now=Date.now()
 const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0')
 const hash=await digest(code)
 const row=await c.env.DB.prepare('INSERT INTO admin_challenges(account_id,code_hash,expires_at,sent_at) VALUES(?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,attempts=0,sent_at=excluded.sent_at WHERE admin_challenges.sent_at<? RETURNING account_id').bind(account,hash,now+300000,now,now-60000).first()
 if(!row)return apiError(c,429,'ADMIN_LIMIT','Новый код можно запросить через минуту.')
 try{await telegram(c.env,'sendMessage',{chat_id:chat.chat_id,text:`Код входа в админку Campus: ${code}\nДействует 5 минут. Если вы не открывали админку, не передавайте этот код.`})}catch{return apiError(c,503,'ADMIN_DELIVERY','Не удалось отправить код в Telegram. Повторите через минуту.')}
 return ok(c,{sent:true})
})
adminRoutes.post('/api/admin/unlock',async c=>{
 const parsed=z.object({code:z.string().regex(/^\d{6}$/)}).safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return validationError(c,parsed.error)
 const account=c.get('user').id
 const row=await c.env.DB.prepare('UPDATE admin_challenges SET attempts=attempts+1 WHERE account_id=? AND expires_at>? AND attempts<5 RETURNING code_hash').bind(account,Date.now()).first<{code_hash:string}>()
 if(!row||row.code_hash!==await digest(parsed.data.code))return apiError(c,403,'ADMIN_CODE','Код неверный или истёк. Запросите новый код.')
 const consumed=await c.env.DB.prepare('DELETE FROM admin_challenges WHERE account_id=? AND code_hash=? RETURNING account_id').bind(account,row.code_hash).first()
 if(!consumed)return apiError(c,403,'ADMIN_CODE','Код уже использован.')
 const token=randomToken()
 await c.env.DB.prepare('INSERT INTO admin_sessions(token_hash,account_id,parent_hash,expires_at) VALUES(?,?,?,?)').bind(await digest(token),account,await digest(getCookie(c,'campus_session')??''),Date.now()+600000).run()
 setCookie(c,'campus_admin',token,{httpOnly:true,secure:new URL(c.req.url).protocol==='https:',sameSite:'Strict',path:'/api/admin',maxAge:600})
 return ok(c,{unlocked:true})
})
adminRoutes.use('/api/admin/*',async(c,next)=>{
 const token=getCookie(c,'campus_admin')
 const session=token?await c.env.DB.prepare('SELECT account_id FROM admin_sessions WHERE token_hash=? AND account_id=? AND parent_hash=? AND expires_at>?').bind(await digest(token),c.get('user').id,await digest(getCookie(c,'campus_session')??''),Date.now()).first():null
 if(!session)return apiError(c,403,'ADMIN_LOCKED','Подтвердите вход кодом из Telegram.')
 await next()
})
adminRoutes.get('/api/admin/accounts',async c=>{
 const offset=Math.max(0,Math.min(1000000,Number(c.req.query('offset'))||0)),query=(c.req.query('q')??'').slice(0,60)
 const filter=`%${query.replace(/[\\%_]/g,'\\$&')}%`
 const connected=c.req.query('connected')==='yes'?1:c.req.query('connected')==='no'?0:null,group=(c.req.query('group')??'').slice(0,120)
 const order=({newest:'created_at DESC',active:'coalesce(visible_ms,0) DESC',seen:'coalesce(last_seen_at,0) DESC',name:'coalesce(p.platonus_name,p.platonus_login,display_name) COLLATE NOCASE'} as Record<string,string>)[c.req.query('sort')??'newest']??'created_at DESC'
 const from="FROM accounts a LEFT JOIN account_activity x ON x.account_id=a.id LEFT JOIN account_profiles p ON p.account_id=a.id WHERE (login LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\' OR p.platonus_name LIKE ? ESCAPE '\\' OR replace(replace(coalesce(p.platonus_login,'')||' '||login,'_',' '),'.',' ') LIKE ? ESCAPE '\\') AND (? IS NULL OR coalesce(p.connected,0)=?) AND (?='' OR p.platonus_group=?)"
 const args=[filter,filter,filter,filter,connected,connected,group,group]
 const users=await c.env.DB.prepare(`SELECT a.id,login,display_name AS displayName,created_at AS createdAt,coalesce(visible_ms,0) AS visibleMs,coalesce(mobile_ms,0) AS mobileMs,last_seen_at AS lastSeenAt,started_at AS trackingSince,install_seen_at AS installSeenAt,installed_at AS installedAt,coalesce(install_request,0) AS installRequest,coalesce(install_shown,-1) AS installShown,p.platonus_name AS profileName,p.platonus_login AS profileLogin,p.platonus_group AS profileGroup,coalesce(p.connected,0) AS profileConnected ${from} ORDER BY ${order},a.id LIMIT 30 OFFSET ?`).bind(...args,offset).all<{id:string;login:string;displayName:string;profileName:string|null;profileLogin:string|null;profileGroup:string|null;profileConnected:number}>()
 const withName=(user:{login:string;displayName:string;profileName:string|null;profileLogin:string|null},status:{platonusName?:string|null;platonusLogin?:string|null}={})=>{const {name,source}=studentName({login:user.login,displayName:user.displayName,platonusName:status.platonusName??user.profileName,platonusLogin:status.platonusLogin??user.profileLogin});return {name,nameSource:source,platonusLogin:status.platonusLogin??user.profileLogin}}
 const items=await Promise.all(users.results.map(async user=>{try{const response=await c.env.WORKSPACES.get(c.env.WORKSPACES.idFromName(user.id)).fetch('https://workspace/internal/account-status',{headers:{'x-campus-owner':user.id}});if(!response.ok)throw new Error();const status=await response.json() as {platonusName?:string|null;platonusLogin?:string|null};return {...user,...status,...withName(user,status),features:await accountFeatures(c.env,user.id)}}catch{return {...user,platonusName:user.profileName,platonusGroup:user.profileGroup,platonusConnected:!!user.profileConnected,...withName(user),statusUnavailable:true}}}))
 const total=await c.env.DB.prepare('SELECT COUNT(*) AS count FROM accounts').first<{count:number}>(),matched=await c.env.DB.prepare(`SELECT COUNT(*) AS count ${from}`).bind(...args).first<{count:number}>()
 const groups=await c.env.DB.prepare("SELECT DISTINCT platonus_group AS name FROM account_profiles WHERE platonus_group IS NOT NULL ORDER BY platonus_group").all()
 return ok(c,{items,total:total?.count??0,matched:matched?.count??0,groups:groups.results})
})
adminRoutes.get('/api/admin/analytics',async c=>{
 const days=Math.min(90,Math.max(1,Number(c.req.query('days'))||7)),since=Math.floor((Date.now()+5*3600000)/86400000)*86400000-5*3600000-(days-1)*86400000,user=(c.req.query('account')??'').slice(0,100),offset=Math.min(100000,Math.max(0,Math.floor(Number(c.req.query('offset'))||0)))
 const results=await c.env.DB.batch([
 c.env.DB.prepare("SELECT kind,count(*) AS count,count(DISTINCT account_id) AS users FROM account_events WHERE created_at>=? AND (?='' OR account_id=?) GROUP BY kind").bind(since,user,user),
 c.env.DB.prepare("SELECT page,count(*) AS count,count(DISTINCT account_id) AS users FROM account_events WHERE created_at>=? AND kind='page.view' AND (?='' OR account_id=?) GROUP BY page ORDER BY count DESC").bind(since,user,user),
 c.env.DB.prepare("SELECT device,browser,count(*) AS count FROM account_events WHERE created_at>=? AND kind='page.view' AND (?='' OR account_id=?) GROUP BY device,browser ORDER BY count DESC").bind(since,user,user),
 c.env.DB.prepare("SELECT e.*,a.login,a.display_name,p.platonus_name,p.platonus_login FROM account_events e JOIN accounts a ON a.id=e.account_id LEFT JOIN account_profiles p ON p.account_id=a.id WHERE e.created_at>=? AND (?='' OR e.account_id=?) ORDER BY e.created_at DESC,e.id DESC LIMIT 50 OFFSET ?").bind(since,user,user,offset),
 c.env.DB.prepare("SELECT count(*) AS count FROM account_activity WHERE last_seen_at>? AND (?='' OR account_id=?)").bind(Date.now()-90000,user,user),
 c.env.DB.prepare("SELECT date(created_at/1000,'unixepoch','+5 hours') AS day,count(*) AS views,count(DISTINCT account_id) AS users FROM account_events WHERE created_at>=? AND kind='page.view' AND (?='' OR account_id=?) GROUP BY day ORDER BY day").bind(since,user,user),
 c.env.DB.prepare("SELECT date(created_at,'+5 hours') AS day,count(*) AS registrations FROM accounts WHERE created_at>=strftime('%Y-%m-%dT%H:%M:%fZ',?/1000.0,'unixepoch') AND (?='' OR id=?) GROUP BY day ORDER BY day").bind(since,user,user)
 ])
 const daily=new Map<string,{day:string;views:number;users:number;registrations:number}>()
 for(const row of results[5].results as {day:string;views:number;users:number}[])daily.set(row.day,{...row,views:Number(row.views),users:Number(row.users),registrations:0})
 for(const row of results[6].results as {day:string;registrations:number}[]){const current=daily.get(row.day)??{day:row.day,views:0,users:0,registrations:0};current.registrations=Number(row.registrations);daily.set(row.day,current)}
 return ok(c,{summary:results[0].results,pages:results[1].results,devices:results[2].results,events:(results[3].results as NameRow[]).map(named),online:(results[4].results[0] as {count:number}|undefined)?.count??0,daily:[...daily.values()].sort((a,b)=>a.day.localeCompare(b.day))})
})
adminRoutes.post('/api/admin/refresh-profiles',async c=>{
 const parsed=z.object({cursor:z.string().max(100).default('')}).strict().safeParse(await c.req.json().catch(()=>({})));if(!parsed.success)return validationError(c,parsed.error)
 const users=await c.env.DB.prepare('SELECT id FROM accounts WHERE deleting=0 AND id>? ORDER BY id LIMIT 30').bind(parsed.data.cursor).all<{id:string}>()
 const results=await Promise.allSettled(users.results.map(u=>c.env.WORKSPACES.get(c.env.WORKSPACES.idFromName(u.id)).fetch('https://workspace/internal/account-status',{headers:{'x-campus-owner':u.id}})))
 return ok(c,{processed:users.results.length,failed:results.filter(r=>r.status==='rejected'||!r.value.ok).length,nextCursor:users.results.length===30?users.results.at(-1)!.id:null})
})
adminRoutes.post('/api/admin/accounts/:id/install-guide',async c=>{
 const id=c.req.param('id'),account=await c.env.DB.prepare('SELECT login FROM accounts WHERE id=? AND deleting=0').bind(id).first<{login:string}>()
 if(!account)return apiError(c,404,'NOT_FOUND','Аккаунт не найден.')
 await c.env.DB.batch([c.env.DB.prepare('INSERT INTO account_activity(account_id,started_at,install_request) VALUES(?,?,1) ON CONFLICT(account_id) DO UPDATE SET install_request=CASE WHEN install_request>install_shown AND install_request>0 THEN install_request ELSE install_request+1 END').bind(id,Date.now()),c.env.DB.prepare('INSERT INTO admin_audit(id,actor_id,action,target_id,target_login,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),c.get('user').id,'install.guide.requested',id,account.login,Date.now())])
 return ok(c,{queued:true})
})
adminRoutes.post('/api/admin/lock',async c=>{await c.env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await digest(getCookie(c,'campus_admin')??'')).run();deleteCookie(c,'campus_admin',{path:'/api/admin'});return ok(c,{locked:true})})
adminRoutes.delete('/api/admin/accounts/:id',async c=>{
 const target=c.req.param('id'),actor=c.get('user').id
 if(target===actor)return apiError(c,409,'ADMIN_SELF','Нельзя удалить аккаунт администратора.')
 const parsed=z.object({confirmLogin:z.string().max(60)}).safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return validationError(c,parsed.error)
 const account=await c.env.DB.prepare('SELECT login FROM accounts WHERE id=?').bind(target).first<{login:string}>()
 if(!account)return apiError(c,404,'NOT_FOUND','Аккаунт не найден.')
 if(parsed.data.confirmLogin!==account.login)return apiError(c,400,'CONFIRM_LOGIN','Введите логин удаляемого аккаунта.')
 if((await membership(c.env.DB,target))?.role==='owner')return apiError(c,409,'GROUP_OWNER','Сначала передайте владение группой этого аккаунта.')
 await c.env.DB.batch([c.env.DB.prepare('UPDATE accounts SET deleting=1 WHERE id=?').bind(target),c.env.DB.prepare('DELETE FROM account_sessions WHERE account_id=?').bind(target),c.env.DB.prepare('DELETE FROM account_connectors WHERE account_id=?').bind(target)])
 const removed=await c.env.WORKSPACES.get(c.env.WORKSPACES.idFromName(target)).fetch('https://workspace/internal/delete',{method:'DELETE',headers:{'x-campus-owner':target}})
 if(!removed.ok)return apiError(c,500,'DELETE_FAILED','Не удалось удалить данные. Сессии отозваны; повторите удаление.')
 await c.env.DB.batch([c.env.DB.prepare('DELETE FROM accounts WHERE id=?').bind(target),c.env.DB.prepare('INSERT INTO admin_audit(id,actor_id,action,target_id,target_login,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,'account.deleted',target,account.login,Date.now())])
 return ok(c,{deleted:true})
})
adminRoutes.get('/api/admin/audit',async c=>ok(c,(await c.env.DB.prepare('SELECT action,target_login AS login,created_at AS createdAt FROM admin_audit ORDER BY created_at DESC LIMIT 50').all()).results))

adminRoutes.put('/api/admin/accounts/:id/permissions',async c=>{
 const parsed=z.object({features:z.array(z.enum(FEATURES)).max(FEATURES.length)}).strict().safeParse(await c.req.json().catch(()=>null))
 if(!parsed.success)return validationError(c,parsed.error)
 const id=c.req.param('id'),account=await c.env.DB.prepare('SELECT login FROM accounts WHERE id=? AND deleting=0').bind(id).first<{login:string}>()
 if(!account)return apiError(c,404,'NOT_FOUND','Аккаунт не найден.')
 if(id===c.env.ADMIN_ACCOUNT_ID)return apiError(c,409,'ADMIN_PERMISSIONS','Права владельца сайта изменить нельзя.')
 const features=[...new Set(parsed.data.features)]
 await c.env.DB.batch([
  c.env.DB.prepare('INSERT INTO account_permissions VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET features_json=excluded.features_json').bind(id,JSON.stringify(features)),
  c.env.DB.prepare('INSERT INTO admin_audit VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),c.get('user').id,`permissions:${features.join(',')||'none'}`,id,account.login,Date.now())
 ])
 return ok(c,{features})
})
adminRoutes.get('/api/admin/storage',async c=>{
 const rows=await c.env.DB.prepare('SELECT kind,SUM(bytes) AS bytes,COUNT(*) AS count,MIN(updated_at) AS oldest FROM storage_inventory GROUP BY kind').all()
 const accounts=await c.env.DB.prepare('SELECT COUNT(*) AS count FROM accounts').all<{count:number}>()
 return ok(c,{items:rows.results,accounts:accounts.results[0]?.count??0,registryBytes:accounts.meta.size_after??null,freePlanLimitBytes:5*1024**3,workspaceLimitBytes:1024**3})
})
adminRoutes.get('/api/admin/analytics/detail',async c=>{
 const parsed=z.object({from:z.coerce.number().int().min(0),to:z.coerce.number().int().min(0),account:z.string().max(100).default(''),offset:z.coerce.number().int().min(0).max(100000).default(0)}).safeParse(c.req.query())
 if(!parsed.success)return validationError(c,parsed.error)
 const {from,to,account,offset}=parsed.data
 if(to<=from||to-from>86400000*90)return apiError(c,400,'RANGE','Выберите период до 90 дней.')
 const result=await c.env.DB.batch([
  c.env.DB.prepare(`WITH activity AS (
   SELECT account_id,page,created_at AS firstAt,created_at AS lastAt,1 AS n FROM account_events WHERE created_at>=? AND created_at<? AND (?='' OR account_id=?)
   UNION ALL SELECT account_id,page,max(started_at,?),min(ended_at,?),0 FROM activity_intervals WHERE ended_at>? AND started_at<? AND (?='' OR account_id=?)
  ) SELECT e.account_id,a.login,a.display_name,p.platonus_name,p.platonus_login,min(e.firstAt) AS firstAt,max(e.lastAt) AS lastAt,SUM(e.n) AS events,group_concat(DISTINCT e.page) AS pages FROM activity e JOIN accounts a ON a.id=e.account_id LEFT JOIN account_profiles p ON p.account_id=a.id GROUP BY e.account_id ORDER BY lastAt DESC LIMIT 30 OFFSET ?`).bind(from,to,account,account,from,to,from,to,account,account,offset),
  c.env.DB.prepare(`SELECT account_id,SUM(min(ended_at,?)-max(started_at,?)) AS ms FROM activity_intervals WHERE ended_at>? AND started_at<? AND (?='' OR account_id=?) GROUP BY account_id`).bind(to,from,from,to,account,account),
  c.env.DB.prepare(`SELECT strftime('%H',created_at/1000,'unixepoch','+5 hours') AS hour,COUNT(*) AS views,COUNT(DISTINCT account_id) AS users FROM account_events WHERE kind='page.view' AND created_at>=? AND created_at<? AND (?='' OR account_id=?) GROUP BY hour`).bind(from,to,account,account),
  c.env.DB.prepare(`SELECT e.*,a.login,a.display_name,p.platonus_name,p.platonus_login FROM account_events e JOIN accounts a ON a.id=e.account_id LEFT JOIN account_profiles p ON p.account_id=a.id WHERE e.created_at>=? AND e.created_at<? AND (?='' OR e.account_id=?) ORDER BY e.created_at DESC LIMIT 100`).bind(from,to,account,account)
 ])
 const durations=new Map((result[1].results as {account_id:string;ms:number}[]).map(row=>[row.account_id,Number(row.ms)]))
 return ok(c,{users:(result[0].results as ({account_id:string}&NameRow)[]).map(row=>({...named(row),visibleMs:durations.get(row.account_id)??null})),hourly:result[2].results,events:(result[3].results as NameRow[]).map(named)})
})
/** Aggregates for the admin dashboard. Activity = page events, visible-time intervals and the last heartbeat; all days are Almaty (UTC+5). */
adminRoutes.get('/api/admin/analytics/overview',async c=>{
 const parsed=z.object({days:z.coerce.number().int().min(7).max(90).default(30),account:z.string().max(100).default('')}).safeParse(c.req.query());if(!parsed.success)return validationError(c,parsed.error)
 const {days,account}=parsed.data,day=86400000,now=Date.now(),today=Math.floor((now+5*3600000)/day)*day-5*3600000,since=today-(days-1)*day,wide=Math.min(since,now-30*day,now-14*day)
 const act=`WITH act AS (SELECT account_id,created_at AS at FROM account_events WHERE created_at>=?1 AND (?2='' OR account_id=?2) UNION ALL SELECT account_id,ended_at FROM activity_intervals WHERE ended_at>=?1 AND (?2='' OR account_id=?2) UNION ALL SELECT account_id,last_seen_at FROM account_activity WHERE last_seen_at>=?1 AND (?2='' OR account_id=?2))`
 const iso=`strftime('%Y-%m-%dT%H:%M:%fZ',?/1000.0,'unixepoch')`
 const db=c.env.DB,r=await db.batch([
  db.prepare(`SELECT count(*) AS total,coalesce(sum(a.created_at>=${iso}),0) AS newPeriod,coalesce(sum(a.created_at>=${iso}),0) AS newToday,coalesce(sum(a.created_at>=${iso}),0) AS new7,coalesce(sum(p.connected),0) AS connected,coalesce(sum(p.platonus_group IS NOT NULL),0) AS withGroup FROM accounts a LEFT JOIN account_profiles p ON p.account_id=a.id WHERE a.deleting=0`).bind(since,today,now-7*day),
  db.prepare(`${act} SELECT count(DISTINCT CASE WHEN at>=?3 THEN account_id END) AS dau,count(DISTINCT CASE WHEN at>=?4 THEN account_id END) AS wau,count(DISTINCT CASE WHEN at>=?5 THEN account_id END) AS mau,count(DISTINCT CASE WHEN at>=?6 THEN account_id END) AS period,(SELECT count(*) FROM account_activity WHERE last_seen_at>?7 AND (?2='' OR account_id=?2)) AS online FROM act`).bind(wide,account,today,now-7*day,now-30*day,since,now-90000),
  db.prepare(`${act} SELECT date(at/1000,'unixepoch','+5 hours') AS day,count(DISTINCT account_id) AS users FROM act WHERE at>=?3 GROUP BY day`).bind(since,account,since),
  db.prepare(`SELECT date(ended_at/1000,'unixepoch','+5 hours') AS day,sum(ended_at-max(started_at,?1)) AS ms,count(DISTINCT account_id) AS users FROM activity_intervals WHERE ended_at>=?1 AND (?2='' OR account_id=?2) GROUP BY day`).bind(since,account),
  db.prepare(`SELECT CAST(strftime('%w',created_at/1000,'unixepoch','+5 hours') AS INTEGER) AS dow,CAST(strftime('%H',created_at/1000,'unixepoch','+5 hours') AS INTEGER) AS hour,count(*) AS views,count(DISTINCT account_id) AS users FROM account_events WHERE kind='page.view' AND created_at>=?1 AND (?2='' OR account_id=?2) GROUP BY dow,hour`).bind(since,account),
  db.prepare(`SELECT coalesce(p.platonus_group,'') AS name,count(*) AS users,coalesce(sum(p.connected),0) AS connected,sum(coalesce(x.last_seen_at,0)>=?) AS active FROM accounts a LEFT JOIN account_profiles p ON p.account_id=a.id LEFT JOIN account_activity x ON x.account_id=a.id WHERE a.deleting=0 GROUP BY name ORDER BY users DESC,name LIMIT 12`).bind(now-7*day),
  db.prepare(`${act},t AS (SELECT account_id,sum(ended_at-max(started_at,?1)) AS ms FROM activity_intervals WHERE ended_at>=?1 AND (?2='' OR account_id=?2) GROUP BY account_id),e AS (SELECT account_id,count(*) AS events FROM account_events WHERE created_at>=?1 AND (?2='' OR account_id=?2) GROUP BY account_id),d AS (SELECT account_id,count(DISTINCT date(at/1000,'unixepoch','+5 hours')) AS days FROM act GROUP BY account_id)
   SELECT a.id,a.login,a.display_name,p.platonus_name,p.platonus_login,p.platonus_group AS \`group\`,coalesce(t.ms,0) AS ms,coalesce(e.events,0) AS events,d.days,x.last_seen_at AS lastSeenAt FROM d JOIN accounts a ON a.id=d.account_id LEFT JOIN t ON t.account_id=a.id LEFT JOIN e ON e.account_id=a.id LEFT JOIN account_profiles p ON p.account_id=a.id LEFT JOIN account_activity x ON x.account_id=a.id WHERE a.deleting=0 ORDER BY ms DESC,d.days DESC,events DESC LIMIT 10`).bind(since,account),
  db.prepare(`${act},prev AS (SELECT DISTINCT account_id FROM act WHERE at>=?3 AND at<?4),cur AS (SELECT DISTINCT account_id FROM act WHERE at>=?4),span AS (SELECT account_id,count(DISTINCT date(at/1000,'unixepoch','+5 hours')) AS days FROM act WHERE at>=?5 GROUP BY account_id)
   SELECT (SELECT count(*) FROM prev) AS prevWeek,(SELECT count(*) FROM prev WHERE account_id IN (SELECT account_id FROM cur)) AS returnedWeek,(SELECT count(*) FROM span) AS periodUsers,(SELECT count(*) FROM span WHERE days>=2) AS multiDay,
   (SELECT count(*) FROM accounts a WHERE a.deleting=0 AND a.created_at>=strftime('%Y-%m-%dT%H:%M:%fZ',?5/1000.0,'unixepoch')) AS newUsers,
   (SELECT count(*) FROM accounts a WHERE a.deleting=0 AND a.created_at>=strftime('%Y-%m-%dT%H:%M:%fZ',?5/1000.0,'unixepoch') AND EXISTS(SELECT 1 FROM act WHERE act.account_id=a.id AND date(at/1000,'unixepoch','+5 hours')>date(a.created_at,'+5 hours'))) AS newReturned FROM (SELECT 1)`).bind(wide,account,now-14*day,now-7*day,since)
 ])
 const first=<T>(i:number)=>(r[i].results[0]??{}) as T,num=(v:unknown)=>Number(v)||0
 const time=r[3].results as {day:string;ms:number;users:number}[],timeMs=time.reduce((s,x)=>s+num(x.ms),0),userDays=time.reduce((s,x)=>s+num(x.users),0)
 const activeByDay=new Map((r[2].results as {day:string;users:number}[]).map(x=>[x.day,num(x.users)])),timeByDay=new Map(time.map(x=>[x.day,num(x.ms)]))
 const series=Array.from({length:days},(_,i)=>{const d=new Date(since+5*3600000+i*day).toISOString().slice(0,10);return {day:d,users:activeByDay.get(d)??0,ms:timeByDay.get(d)??0}})
 const totals=first<Record<string,number>>(0),active=first<Record<string,number>>(1),retention=first<Record<string,number>>(7)
 return ok(c,{days,generatedAt:now,
  totals:{users:num(totals.total),newPeriod:num(totals.newPeriod),newToday:num(totals.newToday),new7:num(totals.new7),connected:num(totals.connected),withGroup:num(totals.withGroup)},
  active:{online:num(active.online),dau:num(active.dau),wau:num(active.wau),mau:num(active.mau),period:num(active.period)},
  avgDailyMs:userDays?Math.round(timeMs/userDays):null,measuredMs:timeMs,
  daily:series,
  heatmap:(r[4].results as {dow:number;hour:number;views:number;users:number}[]).map(x=>({dow:num(x.dow),hour:num(x.hour),views:num(x.views),users:num(x.users)})),
  groups:(r[5].results as {name:string;users:number;connected:number;active:number}[]).map(x=>({name:x.name,users:num(x.users),connected:num(x.connected),active:num(x.active)})),
  top:(r[6].results as ({id:string;group:string|null;ms:number;events:number;days:number;lastSeenAt:number|null}&NameRow)[]).map(x=>{const {display_name:_d,platonus_name:_n,...row}=named(x);return {...row,ms:num(x.ms),events:num(x.events),days:num(x.days)}}),
  retention:{prevWeek:num(retention.prevWeek),returnedWeek:num(retention.returnedWeek),periodUsers:num(retention.periodUsers),multiDay:num(retention.multiDay),newUsers:num(retention.newUsers),newReturned:num(retention.newReturned)}
 })
})
