import {publishGroupSchedule} from '../groups/source'
import {savePlatonusName} from './platonus-profile'
import {queueStudyArchive} from './study-archive'
import {z} from 'zod'
import type {Bindings} from '../types'
import {encryptCredential,decryptCredential} from '../lib/credentials'
import {collectPlatonus,PlatonusError,type PlatonusSession,platonusRequest} from './platonus-api'
import {savePlatonusSnapshot,importInitialSchedule,latest} from '../routes/platonus'
import {notifyPlatonusChanges} from './schedule-notifications'
export type Connection={retry_at:number|null;initial_import_done:number;revision:string;status:string;session_cipher:string|null;challenge_cipher:string|null;challenge_until:number|null;last_sync_at:string|null;last_error:string|null;busy_until:number;credentials_cipher:string|null;schedule_changed:number;schedule_fingerprint:string|null}
export async function connection(db:D1Database){
 const state=(await db.prepare('SELECT * FROM platonus_connection WHERE id=1').first<Connection>())!
 // One-time authentication only covers the initial download, never an ongoing connection.
 if(!state.credentials_cipher&&state.session_cipher&&state.last_sync_at&&state.status!=='syncing'&&Date.now()-Date.parse(state.last_sync_at)>15*60000){await db.prepare('UPDATE platonus_connection SET session_cipher=NULL WHERE revision=? AND credentials_cipher IS NULL').bind(state.revision).run();state.session_cipher=null}
 return state
}
export async function seal(env:Bindings,value:unknown){return encryptCredential(JSON.stringify({owner:env.OWNER_ID,value}),env.CREDENTIALS_ENCRYPTION_KEY)}
export async function unseal<T>(env:Bindings,value:string):Promise<T>{const data=JSON.parse(await decryptCredential(value,env.CREDENTIALS_ENCRYPTION_KEY));if(data.owner!==env.OWNER_ID)throw new Error('Platonus session owner mismatch');return data.value}
export function publicConnection(c:Connection){return {retryAt:c.retry_at,initialImportDone:Boolean(c.initial_import_done),status:c.status==='syncing'&&c.busy_until<Date.now()?'connected':c.status,needsCode:c.status==='verification'&&(c.challenge_until??0)>Date.now(),lastSyncAt:c.last_sync_at,error:c.last_error,automaticSync:c.credentials_cipher?'Каждый час':'После входа',cloud:true,scheduleChanged:Boolean(c.schedule_changed),credentialsSaved:Boolean(c.credentials_cipher)}}
export async function renewPlatonusSession(env:Bindings,prior:Connection){
 const db=env.DB
   if(!prior.credentials_cipher)throw new PlatonusError('Сессия Platonus истекла. Войдите повторно.',true)
   const credentials=await unseal<{login:string;password:string}>(env,prior.credentials_cipher)
   const reply=await platonusRequest('/rest/api/login',undefined,{...credentials,iin:null,icNumber:null,authForDeductedStudentsAndGraduates:false})
   const auth=z.object({login_status:z.string(),auth_token:z.string().optional(),sid:z.union([z.string(),z.number()]).optional()}).safeParse(reply.data)
   if(!auth.success||auth.data.login_status!=='success'||!auth.data.auth_token)throw new PlatonusError('Platonus требует повторного входа или подтверждения кодом. Откройте подключение в настройках.',true)
   const session:PlatonusSession={token:auth.data.auth_token,cookie:reply.cookie,sid:auth.data.sid===undefined?undefined:String(auth.data.sid)}
   const saved=await db.prepare("UPDATE platonus_connection SET session_cipher=?,status=CASE WHEN status='expired' THEN 'connected' ELSE status END WHERE id=1 AND revision=? RETURNING id").bind(await seal(env,session),prior.revision).first()
   if(!saved)throw new PlatonusError('Подключение изменилось. Обновите страницу.')
   return session
  }
export async function syncPlatonus(env:Bindings,manual=false,initialLogin=false){
 const db=env.DB,prior=await connection(db)
 if(!prior.credentials_cipher&&!initialLogin)return
 if(prior.status==='expired'&&!manual)return
 if((!prior.session_cipher&&!prior.credentials_cipher)||prior.status==='disconnected'||prior.status==='verification')return
 const locked=await db.prepare("UPDATE platonus_connection SET status='syncing',busy_until=?,last_error=NULL WHERE id=1 AND revision=? AND busy_until<? AND (?=1 OR last_sync_at IS NULL OR last_sync_at<?) RETURNING revision").bind(Date.now()+150000,prior.revision,Date.now(),manual?1:0,new Date(Date.now()-50*60000).toISOString()).first()
 if(!locked)return
 try{
  const reconnect=()=>renewPlatonusSession(env,prior)
  let session=prior.session_cipher?await unseal<PlatonusSession>(env,prior.session_cipher):await reconnect()
  let snapshot
  try{snapshot=await collectPlatonus(session)}catch(e){if(!(e instanceof PlatonusError&&e.expired&&prior.credentials_cipher&&prior.session_cipher))throw e;session=await reconnect();snapshot=await collectPlatonus(session)}
  const canonical=JSON.stringify(snapshot.lessons.map(({weekNumber,...l})=>({...l,parity:weekNumber%2})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))
  const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical)))).map(b=>b.toString(16).padStart(2,'0')).join('')
  // Login/disconnect increments revision; an old in-flight sync must not publish into the new connection.
  const current=await connection(db);if(current.revision!==prior.revision)return
  const {retryableSections,...payload}=snapshot
  const previous=await latest(db)
  if(!await savePlatonusSnapshot(db,payload,prior.revision))return
  // The first snapshot of a connection only imports; later ones report what changed in Platonus.
  if(prior.initial_import_done&&previous)await notifyPlatonusChanges(env,JSON.parse(previous.payload_json),payload).catch(()=>{/* Notifications never block a sync. */})
  if(!prior.initial_import_done)await importInitialSchedule(env,prior.revision)
  await db.prepare("UPDATE platonus_connection SET retry_at=NULL,initial_import_done=1,status='connected',last_sync_at=?,busy_until=0,last_error=NULL,schedule_changed=CASE WHEN schedule_fingerprint IS NOT NULL AND schedule_fingerprint<>? THEN 1 ELSE schedule_changed END,schedule_fingerprint=? WHERE id=1 AND revision=?").bind(snapshot.capturedAt,fingerprint,fingerprint,prior.revision).run()
  if((await connection(db)).revision===prior.revision){
   const retryAt=prior.credentials_cipher&&retryableSections?Date.now()+300000:null
   await db.prepare('UPDATE platonus_connection SET retry_at=? WHERE revision=?').bind(retryAt,prior.revision).run()
   await env.schedulePlatonusRetry?.(retryAt)
  }
  if(env.OWNER_ID)await publishGroupSchedule(env,env.OWNER_ID,payload)
  await queueStudyArchive(env)
  await savePlatonusName(env,session,prior.revision)
 }catch(error){
  const expired=error instanceof PlatonusError&&error.expired
  const retryAt=prior.credentials_cipher&&error instanceof PlatonusError&&error.retryable?Date.now()+300000:null
  await db.prepare('UPDATE platonus_connection SET retry_at=? WHERE revision=?').bind(retryAt,prior.revision).run()
  if((await connection(db)).revision===prior.revision)await env.schedulePlatonusRetry?.(retryAt)
  await db.prepare("UPDATE platonus_connection SET status=?,session_cipher=CASE WHEN ?=1 THEN NULL ELSE session_cipher END,last_error=?,busy_until=0 WHERE id=1 AND revision=?").bind(expired?'expired':'connected',expired?1:0,error instanceof PlatonusError?error.message:error instanceof z.ZodError?'Формат данных Platonus: '+error.issues.slice(0,6).map(i=>i.path.join('.')+' ('+i.code+')').join(', '):'Не удалось обработать данные Platonus. Предыдущий снимок сохранён.',prior.revision).run()
 }
}
