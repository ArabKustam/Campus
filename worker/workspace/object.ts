import {accountFeatures} from '../permissions'
import umkdVersions from '../../migrations/0027_umkd_versions.sql'
import lessonFiles from '../../migrations/0029_lesson_files.sql'
import {handleSharedArchive,type ArchiveCopy} from '../services/shared-archive'
import platonusJournals from '../../migrations/0016_platonus_journals.sql'
import studyArchive from '../../migrations/0018_study_archive.sql'
import platonusProfile from '../../migrations/0021_platonus_profile.sql'
import scheduleRemovals from '../../migrations/0022_schedule_removals.sql'
import platonusGroup from '../../migrations/0024_platonus_group.sql'
import {savePlatonusName,savePlatonusLogin} from '../services/platonus-profile'
import {connection,unseal} from '../services/platonus-cloud'
import type {PlatonusSession} from '../services/platonus-api'
import {runStudyArchive} from '../services/study-archive'
import platonusOnboarding from '../../migrations/0015_platonus_onboarding.sql'
import assistantLists from '../../migrations/0014_assistant_lists.sql'
import {savePlatonusSnapshot} from '../routes/platonus'
import platonusRefresh from '../../migrations/0013_platonus_refresh.sql'
import platonusCloud from '../../migrations/0012_platonus_cloud.sql'
import { syncPlatonus } from '../services/platonus-cloud'
import platonus from '../../migrations/0011_platonus.sql'
import messengerAudit from '../../migrations/0010_messenger_audit.sql'
import history from '../../migrations/0009_history_profiles.sql'
import { workspaceFiles } from './files'
import { DurableObject } from 'cloudflare:workers'
import { app } from '../app'
import type { Bindings } from '../types'
import { workspaceDatabase } from './sqlite'
import initial from '../../migrations/0001_initial_schema.sql'
import seed from '../../migrations/0002_seed_schedule.sql'
import claims from '../../migrations/0003_add_message_processing_claims.sql'
import addLesson from '../../migrations/0005_add_lesson_action.sql'
import assistant from '../../migrations/0008_assistant_usage.sql'
import people from '../../migrations/0007_people.sql'
import { runScheduledProcessing } from '../services/processing'

export class Workspace extends DurableObject<Bindings> {
  private db: D1Database
  private archivePending=new Map<string,Promise<ArchiveCopy>>()
  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env)
    this.db = workspaceDatabase(ctx.storage)
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS workspace_migrations (version INTEGER PRIMARY KEY)')
    const migrations = [initial, seed, claims, addLesson, people, assistant, history, messengerAudit, platonus, platonusCloud, platonusRefresh, assistantLists,platonusOnboarding,platonusJournals,studyArchive,platonusProfile,scheduleRemovals,platonusGroup,umkdVersions,lessonFiles]
    ctx.storage.transactionSync(() => {
      migrations.forEach((sql, version) => {
        if (ctx.storage.sql.exec('SELECT version FROM workspace_migrations WHERE version = ?', version).toArray().length) return
        ctx.storage.sql.exec(sql)
        ctx.storage.sql.exec('INSERT INTO workspace_migrations (version) VALUES (?)', version)
      })
    })
  }
  private async retry(at:number|null,owner:string,kind='platonus'){
    await this.ctx.storage.put('platonus-owner',owner)
    await this.ctx.storage.put(kind+'-retry-at',at)
    const dates=await Promise.all(['platonus','study'].map(key=>this.ctx.storage.get<number|null>(key+'-retry-at')))
    const due=dates.filter((value):value is number=>typeof value==='number')
    if(due.length)await this.ctx.storage.setAlarm(Math.max(Date.now()+500,Math.min(...due)));else await this.ctx.storage.deleteAlarm()
  }
  async alarm(){
    const owner=await this.ctx.storage.get<string>('platonus-owner');if(!owner)return
    const env={...this.env,REGISTRY:this.env.DB,DB:this.db,OWNER_ID:owner,ATTACHMENTS:workspaceFiles(this.ctx.storage),WORKSPACE_BYTES:this.ctx.storage.sql.databaseSize,schedulePlatonusRetry:(at:number|null)=>this.retry(at,owner),scheduleStudyRetry:(at:number|null)=>this.retry(at,owner,'study')}
    const retry=await this.ctx.storage.get<number>('platonus-retry-at')??(await this.db.prepare('SELECT retry_at FROM platonus_connection WHERE id=1').first<{retry_at:number|null}>())?.retry_at
    if(retry&&retry<=Date.now()){await this.retry(null,owner);await syncPlatonus(env,true)}
    await runStudyArchive(env)
  }
  async fetch(request: Request) {
    const url = new URL(request.url)
    // Only the authenticated gateway can obtain this stub; no user-supplied owner identifiers are trusted.
    const ownerId = request.headers.get('x-campus-owner')!
    if(/^archive:\d{1,10}$/.test(ownerId))return handleSharedArchive(this.ctx.storage,this.env,ownerId.slice(8),request,this.archivePending)
    if(ownerId.startsWith('group:')||url.pathname==='/internal/initialize-empty'){
      this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS workspace_initialized(id INTEGER PRIMARY KEY)')
      if(!this.ctx.storage.sql.exec('SELECT id FROM workspace_initialized').toArray().length)this.ctx.storage.transactionSync(()=>{
        this.ctx.storage.sql.exec('DELETE FROM schedule_slots; DELETE FROM teachers; DELETE FROM subjects; INSERT INTO workspace_initialized(id) VALUES(1)')
      })
      if(url.pathname==='/internal/initialize-empty')return new Response(null,{status:204})
    }
    const env = { ...this.env, REGISTRY:this.env.DB, DB: this.db, ATTACHMENTS: workspaceFiles(this.ctx.storage), OWNER_ID: ownerId, WORKSPACE_BYTES: this.ctx.storage.sql.databaseSize,schedulePlatonusRetry:(at:number|null)=>this.retry(at,ownerId),scheduleStudyRetry:(at:number|null)=>this.retry(at,ownerId,'study') }
    if(url.pathname==='/internal/group-exclusions'&&ownerId.startsWith('group:')){
      const ids=await this.ctx.storage.get<string[]>('group-exclusions')??[]
      if(request.method==='POST'){const body=await request.json() as {slotId:string;hidden:boolean};const next=body.hidden?[...new Set([...ids,body.slotId])]:ids.filter(id=>id!==body.slotId);await this.ctx.storage.put('group-exclusions',next);return Response.json(next)}
      return Response.json(ids)
    }
    if(url.pathname.startsWith('/internal/homework/')&&request.method==='GET'){const row=await this.db.prepare('SELECT id FROM homework WHERE id=?').bind(decodeURIComponent(url.pathname.split('/').at(-1)!)).first();return new Response(null,{status:row?204:404})}
    if(url.pathname==='/internal/schedule-snapshot'&&ownerId.startsWith('group:')&&request.method==='POST'){await savePlatonusSnapshot(this.db,await request.json());return new Response(null,{status:204})}
    if(url.pathname==='/internal/account-status'){
      await this.env.DB.prepare('INSERT INTO storage_inventory VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET bytes=excluded.bytes,updated_at=excluded.updated_at').bind(ownerId,'account',this.ctx.storage.sql.databaseSize,Date.now()).run()
      const state=await connection(this.db),profile=await this.db.prepare('SELECT name,group_name FROM platonus_profile WHERE id=1').first<{name:string;group_name:string|null}>()
      if(!profile&&state.session_cipher){const last=await this.ctx.storage.get<number>('profile-attempt')??0;if(Date.now()-last>300000){await this.ctx.storage.put('profile-attempt',Date.now());this.ctx.waitUntil(unseal<PlatonusSession>(env,state.session_cipher).then(session=>savePlatonusName(env,session,state.revision)).catch(()=>{}))}}
      let login:string|null=null;if(state.credentials_cipher)try{login=(await unseal<{login:string}>(env,state.credentials_cipher)).login}catch{}
      if(login)await savePlatonusLogin(env,login)
      await this.env.DB.prepare('INSERT INTO account_profiles(account_id,platonus_name,platonus_group,connected,last_sync_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET platonus_name=excluded.platonus_name,platonus_group=excluded.platonus_group,connected=excluded.connected,last_sync_at=excluded.last_sync_at,updated_at=excluded.updated_at').bind(ownerId,profile?.name??null,profile?.group_name??null,state.credentials_cipher?1:0,state.last_sync_at,Date.now()).run()
      return Response.json({platonusName:profile?.name??null,platonusLogin:login,platonusGroup:profile?.group_name??null,platonusStatus:state.status,platonusConnected:!!state.credentials_cipher,lastSyncAt:state.last_sync_at,platonusError:state.last_error,storageBytes:this.ctx.storage.sql.databaseSize})
    }
    if (url.pathname === '/internal/delete' && request.method === 'DELETE') { await this.ctx.storage.deleteAll(); await this.env.DB.prepare('DELETE FROM storage_inventory WHERE id=?').bind(ownerId).run(); return new Response(null, { status: 204 }) }
    if (url.pathname === '/internal/process') {
      this.ctx.waitUntil(Promise.allSettled([...(await accountFeatures(env,ownerId)).includes('messengers')?[runScheduledProcessing(env)]:[],syncPlatonus(env),runStudyArchive(env)]).then(async()=>{await this.env.DB.prepare('INSERT INTO storage_inventory VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET bytes=excluded.bytes,updated_at=excluded.updated_at').bind(ownerId,'account',this.ctx.storage.sql.databaseSize,Date.now()).run()}))
      return new Response(null, { status: 202 })
    }
    return app.fetch(request, env, this.ctx as unknown as ExecutionContext)
  }
}
