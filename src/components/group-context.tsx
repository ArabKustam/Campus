import {t,useLanguage,LanguageSelect} from '../lib/language'
import {PlatonusConnect} from './platonus-connect'
import {useFeature} from '../lib/features'
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react'
import {requestApi,setCampusScope,setCampusOverlay,setCampusGroupAccess} from '../lib/api-client'
import {useAccount} from './auth-gate'
import {Button} from './ui/button'
export type GroupData={group:null|{id:string;name:string};member?:{role:string;subgroup_id:string|null};members?:{id:string;name:string;role:string;subgroupId:string|null;requestedSubgroupId:string|null}[];subgroups?:{id:string;name:string}[];onboarding:boolean;notices?:{scope:string;changed:number}[];platonusGroup?:string|null;suggestion?:{name:string;exists:boolean}|null;invites?:{active:number;expiresAt:number|null}}
const GroupContext=createContext<{data:GroupData;scope:string;overlay:boolean;toggleOverlay:()=>void;refresh:()=>Promise<void>;choose:(scope:string)=>void}|null>(null)
export function useGroup(){return useContext(GroupContext)!}
function EnabledGroupGate({children}:{children:ReactNode}){
 useLanguage();
 const {user}=useAccount(),[data,setData]=useState<GroupData|null>(null),[scope,setScope]=useState('personal'),[overlay,setOverlay]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[connect,setConnect]=useState(false)
 const [invitation,setInvitation]=useState<{name:string;members?:number}|null>(null),invitationName=invitation?.name??''
 const [invite,setInvite]=useState(()=>new URLSearchParams(location.search).get('invite'))
 useEffect(()=>{if(invite)void requestApi<{name:string;members?:number}>(`/api/groups/invitation/${encodeURIComponent(invite)}`).then(setInvitation).catch(e=>setError(e.message))},[invite])
 async function refresh(){const result=await requestApi<GroupData>('/api/groups');setData(result);if(!['personal','common','group','all'].includes(scope)&&!result.subgroups?.some(s=>s.id===scope))choose(result.group?'group':'personal');return result}
 function choose(value:string){setCampusScope(value);setScope(value);sessionStorage.setItem(`campus-scope-${user.id}`,value)}
 useEffect(()=>{setCampusScope('personal');void refresh().then(result=>{const saved=sessionStorage.getItem(`campus-scope-${user.id}`)||'group';choose(!result.group?'personal':['personal','common','group','all'].includes(saved)||result.subgroups?.some(s=>s.id===saved)?saved:'group')}).catch(e=>setError(e.message));return()=>{setCampusScope('personal');setCampusOverlay(false)}},[user.id])
 useEffect(()=>{const timer=setInterval(()=>{void refresh().catch(()=>{})},60000);return()=>clearInterval(timer)},[scope])
 async function finish(){setBusy(true);try{await requestApi('/api/onboarding',{method:'POST'});await refresh()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 if(!data)return <main className="p-6"><p role="status">{error||'Загружаем ваше пространство…'}</p>{error&&<Button onClick={()=>location.reload()}>{t("Повторить")}</Button>}</main>
 if(invite&&!data.group)return <main className="mx-auto max-w-md space-y-4 p-6"><h1 className="break-words text-xl font-semibold">{t('Приглашение в группу')}{invitationName?`: ${invitationName}`:''}</h1>{!!invitation?.members&&<p className="text-sm text-muted-foreground">{t('Участников: {n}').split('{n}').join(String(invitation.members))}</p>}<p>{t('После вступления расписание группы будет доступно без подключения Platonus.')}</p>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={busy||!invitationName} onClick={async()=>{setBusy(true);try{await requestApi('/api/groups/join',{method:'POST',body:JSON.stringify({token:invite})});setInvite(null);history.replaceState(null,'',location.pathname);await refresh();choose('group')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>{t('Присоединиться')}</Button><Button variant="ghost" onClick={()=>{setInvite(null);setError('');history.replaceState(null,'',location.pathname)}}>{t('Позже')}</Button></main>
 if(data.onboarding)return <main className="mx-auto max-w-4xl space-y-4 p-6"><h1 className="text-2xl font-semibold">{t("Добро пожаловать в Campus")}</h1><p className="text-muted-foreground">Подключите Platonus, чтобы получить расписание, оценки и учебные материалы. Если у вас есть приглашение группы, откройте его — подключение не потребуется.</p>{connect?<PlatonusConnect onReady={()=>void finish()}/>:<Button onClick={()=>setConnect(true)}>{t("Подключить Platonus")}</Button>}<Button variant="outline" disabled={busy} onClick={()=>void finish()}>{connect?'Перейти в Campus':'Настроить позже'}</Button>{error&&<p role="alert">{error}</p>}</main>
 return <GroupContext.Provider value={{data,scope,overlay,toggleOverlay:()=>{setCampusOverlay(!overlay);setOverlay(!overlay)},refresh:async()=>{await refresh()},choose}}><div key={scope+String(overlay)}>{children}</div></GroupContext.Provider>
}
export function subgroupLabel(name:string){return /^\d+$/.test(name)?`Подгруппа «${name}»`:name}
export function ScopePicker({purpose=t("Расписание"),comparison=false,disabled=false}:{purpose?:string;comparison?:boolean;disabled?:boolean}){
 useLanguage();
 const ctx=useGroup();if(!ctx?.data.group)return null
 const {data,scope,choose}=ctx,admin=['owner','head'].includes(data.member?.role??''),own=data.subgroups?.find(s=>s.id===data.member?.subgroup_id)
 return <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm"><label className="flex min-w-0 flex-wrap items-center gap-2"><span className="text-muted-foreground">{purpose}</span><select disabled={disabled} aria-label={purpose} className="max-w-full rounded-md border bg-background px-3 py-2 text-sm" value={scope} onChange={e=>choose(e.target.value)}>
 <option value="group">{own?`${subgroupLabel(own.name)} · моя`:'Для всех · подгруппа не назначена'}</option><option value="personal">Личное · только для меня</option>
 {admin&&<option value="common">Для всех подгрупп</option>}
 {data.subgroups?.filter(s=>(admin||s.id===data.member?.subgroup_id)&&(s.id!==own?.id||scope===s.id)).map(s=><option key={s.id} value={s.id}>{subgroupLabel(s.name)}</option>)}
 {(comparison||scope==='all')&&admin&&<option value="all">Сравнить подгруппы</option>}</select></label></div>
}
export function ScopeHelp(){
 useLanguage();const ctx=useGroup();if(!ctx?.data.group)return null;const {scope,data}=ctx;return <p className="text-xs text-muted-foreground">{scope==='personal'?'Изменения видны только вам.':scope==='all'?'Сравнение подгрупп. Для изменения выберите нужную подгруппу.':scope==='common'?'Эти занятия и задания предназначены всем подгруппам. Отличия настраиваются у каждой подгруппы отдельно.':`Изменения для ${subgroupLabel(data.subgroups?.find(s=>s.id===(scope==='group'?data.member?.subgroup_id:scope))?.name??'участников без подгруппы')}. Занятия для всех также входят в расписание.`}</p>}
export function useGroupReadOnly(){const ctx=useContext(GroupContext);if(!ctx||ctx.scope==='personal'||!ctx.data.group)return false;if(ctx.scope==='all')return true;const m=ctx.data.member!;return !(['owner','head'].includes(m.role)||(m.role==='subhead'&&(ctx.scope==='group'||ctx.scope===m.subgroup_id)))}

export function GroupGate({children}:{children:ReactNode}){
 useLanguage();const groupsEnabled=useFeature('groups');useEffect(()=>{setCampusGroupAccess(groupsEnabled);return()=>setCampusGroupAccess(false)},[groupsEnabled]);return groupsEnabled?<EnabledGroupGate>{children}</EnabledGroupGate>:<IndividualGate>{children}</IndividualGate>}
function IndividualGate({children}:{children:ReactNode}){
 useLanguage();
 const {user}=useAccount(),[ready,setReady]=useState(false),[onboarding,setOnboarding]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
 useEffect(()=>{let active=true;setCampusScope('personal');setCampusOverlay(false);sessionStorage.removeItem(`campus-scope-${user.id}`);const url=new URL(location.href);if(url.searchParams.has('invite')){url.searchParams.delete('invite');history.replaceState(null,'',url.pathname+url.search+url.hash)}
 void requestApi<{onboarding:boolean}>('/api/onboarding').then(result=>{if(active){setOnboarding(result.onboarding);setReady(true)}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[user.id])
 async function finish(){setBusy(true);setError('');try{await requestApi('/api/onboarding',{method:'POST'});sessionStorage.setItem('campus-start-tour','1');sessionStorage.setItem('campus-active-page','schedule');setOnboarding(false)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 if(!ready)return <main className="p-6"><p role="status">{error||'Загружаем ваш аккаунт…'}</p>{error&&<Button onClick={()=>location.reload()}>{t("Повторить")}</Button>}</main>
 if(onboarding)return <main className="mx-auto max-w-xl space-y-5 p-4 sm:p-6"><div className="flex items-center justify-between gap-3"><img src="/campus.svg" alt="Campus" className="size-12"/><LanguageSelect/></div><PlatonusConnect onReady={()=>void finish()}/><Button variant="ghost" disabled={busy} onClick={()=>void finish()}>{t("Настроить вручную")}</Button>{error&&<p role="alert">{error}</p>}</main>
 return <GroupContext.Provider value={{data:{group:null,onboarding:false},scope:'personal',overlay:false,toggleOverlay:()=>{},refresh:async()=>{},choose:()=>setCampusScope('personal')}}>{children}</GroupContext.Provider>
}
