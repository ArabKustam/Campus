import {updatePlatonusDirectory,savePlatonusLogin} from '../services/platonus-profile'
import {Hono} from 'hono'
import {z} from 'zod'
import type {Bindings} from '../types'
import {ok,apiError,validationError} from '../lib/api'
import {connection,publicConnection,seal,unseal,syncPlatonus} from '../services/platonus-cloud'
import {platonusRequest,PlatonusError,type PlatonusSession} from '../services/platonus-api'
const credentials=z.object({login:z.string().trim().min(1).max(150),password:z.string().min(1).max(200),remember:z.boolean().default(false)}).strict()
const auth=z.object({login_status:z.string(),auth_token:z.string().max(4096).optional(),sid:z.union([z.string(),z.number()]).optional(),challengeId:z.union([z.string(),z.number()]).optional(),verifyStatus:z.string().optional()})
export const platonusCloudRoutes=new Hono<{Bindings:Bindings}>()
platonusCloudRoutes.get('/platonus/availability',async c=>{
 try{await platonusRequest('/rest/api/authType');return ok(c,{reachable:true})}
 catch(e){return ok(c,{reachable:false,error:e instanceof PlatonusError?e.message:'Нет связи с Platonus'})}
})
platonusCloudRoutes.get('/platonus/connection',async c=>ok(c,publicConnection(await connection(c.env.DB))))
platonusCloudRoutes.post('/platonus/:operation',async c=>{
 const operation=c.req.param('operation')
 if(!['login','verify','sync','disconnect','acknowledge'].includes(operation))return c.notFound()
 const env=c.env,db=env.DB
 if(operation==='acknowledge'){
  const body=z.object({snapshotId:z.uuid()}).safeParse(await c.req.json().catch(()=>null));if(!body.success)return validationError(c,body.error)
  const changed=await db.prepare('UPDATE platonus_connection SET schedule_changed=0 WHERE id=1 AND ?=(SELECT id FROM platonus_snapshots ORDER BY rowid DESC LIMIT 1) RETURNING id').bind(body.data.snapshotId).first()
  if(!changed)return apiError(c,409,'STALE_PREVIEW','Platonus обновил расписание. Загрузите сравнение ещё раз.')
  return ok(c,publicConnection(await connection(db)))
 }
 if(operation==='disconnect'){
  await db.prepare("UPDATE platonus_connection SET retry_at=NULL,revision=?,status='disconnected',credentials_cipher=NULL,session_cipher=NULL,challenge_cipher=NULL,challenge_until=NULL,busy_until=0,last_error=NULL WHERE id=1").bind(crypto.randomUUID()).run()
  await env.schedulePlatonusRetry?.(null)
  await updatePlatonusDirectory(env).catch(()=>{})
  return ok(c,publicConnection(await connection(db)))
 }
 if(operation==='sync'){
  const state=await connection(db)
  if(!state.credentials_cipher)return apiError(c,409,'PLATONUS_LOGIN_REQUIRED','Для обновления войдите в Platonus ещё раз. Данные входа не сохранены.')
  if(state.busy_until>Date.now())return apiError(c,409,'PLATONUS_BUSY','Обновление уже выполняется.')
  c.executionCtx.waitUntil(syncPlatonus(env,true));return ok(c,{...publicConnection(state),status:'syncing'},202)
 }
 const input=operation==='login'?credentials.safeParse(await c.req.json().catch(()=>null)):z.object({code:z.string().regex(/^\d{4,8}$/)}).strict().safeParse(await c.req.json().catch(()=>null))
 if(!input.success)return validationError(c,input.error)
 if(!env.CREDENTIALS_ENCRYPTION_KEY)return apiError(c,503,'PLATONUS_SETUP','Подключение Platonus ещё настраивается.')
 const revision=crypto.randomUUID(),prior=await connection(db)
 if(operation==='verify'&&(!prior.challenge_cipher||(prior.challenge_until??0)<Date.now()))return apiError(c,409,'CODE_EXPIRED','Время подтверждения истекло. Начните вход заново.')
 const locked=await db.prepare("UPDATE platonus_connection SET revision=?,busy_until=?,attempts=CASE WHEN attempts_until<? THEN 1 ELSE attempts+1 END,attempts_until=CASE WHEN attempts_until<? THEN ? ELSE attempts_until END WHERE id=1 AND revision=? AND busy_until<? AND (attempts_until<? OR attempts<5) RETURNING id").bind(revision,Date.now()+25000,Date.now(),Date.now(),Date.now()+60000,prior.revision,Date.now(),Date.now()).first()
 if(!locked)return apiError(c,429,'PLATONUS_RATE_LIMIT','Вход уже выполняется или попыток слишком много. Подождите минуту.')
 await db.prepare('UPDATE platonus_connection SET retry_at=NULL WHERE revision=?').bind(revision).run()
 await env.schedulePlatonusRetry?.(null)
 const loginInput=operation==='login'?input.data as z.infer<typeof credentials>:null
 const savedCredentials=loginInput?.remember?await seal(env,{login:loginInput.login,password:loginInput.password}):null
 if(operation==='login')await db.prepare('UPDATE platonus_connection SET credentials_cipher=NULL,session_cipher=NULL,challenge_cipher=NULL,challenge_until=NULL WHERE revision=?').bind(revision).run()
 try{
  const challenge=operation==='verify'?await unseal<{id:string|number;cookie:string;credentialsCipher?:string;login?:string}>(env,prior.challenge_cipher!):null
  const body=operation==='login'?{login:loginInput!.login,password:loginInput!.password,iin:null,icNumber:null,authForDeductedStudentsAndGraduates:false}:{challengeId:challenge!.id,...(input.data as {code:string})}
  const response=await platonusRequest(operation==='login'?'/rest/api/login':'/rest/api/verifyCode',challenge?{token:'',cookie:challenge.cookie}:undefined,body)
  const parsed=auth.safeParse(response.data)
  if(!parsed.success)throw new PlatonusError('Platonus вернул неизвестный ответ при входе.')
  if(parsed.data.login_status==='success'&&parsed.data.auth_token){
   const session:PlatonusSession={token:parsed.data.auth_token,sid:parsed.data.sid===undefined?undefined:String(parsed.data.sid),cookie:response.cookie||challenge?.cookie||undefined}
   const cipher=await seal(env,session)
   const credentialsCipher=operation==='login'?savedCredentials:challenge?.credentialsCipher??null
   const saved=await db.prepare("UPDATE platonus_connection SET status='connected',session_cipher=?,credentials_cipher=?,challenge_cipher=NULL,challenge_until=NULL,last_error=NULL,last_sync_at=NULL,busy_until=0 WHERE id=1 AND revision=? RETURNING id").bind(cipher,credentialsCipher,revision).first()
   if(saved){await savePlatonusLogin(env,loginInput?.login??challenge?.login);c.executionCtx.waitUntil(syncPlatonus(env,true,true))}
   return ok(c,{...publicConnection(await connection(db)),status:saved?'syncing':'disconnected'})
  }
  if(parsed.data.login_status==='verificationCode'&&parsed.data.challengeId!==undefined){
   await db.prepare("UPDATE platonus_connection SET status='verification',session_cipher=NULL,challenge_cipher=?,challenge_until=?,busy_until=0,last_error=NULL WHERE id=1 AND revision=?").bind(await seal(env,{id:parsed.data.challengeId,cookie:response.cookie,credentialsCipher:operation==='login'?savedCredentials:challenge?.credentialsCipher,login:loginInput?.login??challenge?.login}),Date.now()+10*60000,revision).run()
   return ok(c,publicConnection(await connection(db)))
  }
  throw new PlatonusError(operation==='login'?'Не удалось войти. Проверьте логин и пароль Platonus.':'Код не принят. Проверьте код подтверждения.')
 }catch(error){
  const rawMessage=error instanceof PlatonusError?error.message:'Не удалось подключить Platonus. Повторите позже.'
  const message=operation==='login'&&!savedCredentials?rawMessage.replace('Campus повторит загрузку автоматически.','Для новой попытки введите данные входа ещё раз.'):rawMessage
  if(operation==='login'&&savedCredentials&&error instanceof PlatonusError&&error.retryable){
   const retryAt=Date.now()+300000
   const saved=await db.prepare("UPDATE platonus_connection SET status='connected',session_cipher=NULL,credentials_cipher=?,retry_at=?,busy_until=0,last_error=? WHERE id=1 AND revision=? RETURNING id").bind(savedCredentials,retryAt,message,revision).first()
   if(saved)await env.schedulePlatonusRetry?.(retryAt)
   return ok(c,publicConnection(await connection(db)),202)
  }

  await db.prepare("UPDATE platonus_connection SET busy_until=0,last_error=?,status=CASE WHEN ?='login' THEN 'expired' ELSE status END WHERE id=1 AND revision=?").bind(message,operation,revision).run()
  return apiError(c,422,'PLATONUS_AUTH',message)
 }
})
