import {t,useLanguage} from '../lib/language'
import {useCallback,useEffect,useState} from 'react'
import {Menu,RefreshCw} from 'lucide-react'
import {useGroup} from './group-context'
import {Button} from './ui/button'
import {LoadingState,ErrorState} from './ui/page-state'
import {requestApi} from '../lib/api-client'
import {PlatonusUmkd} from './platonus-umkd'
import type {StudySection} from '../../bridge/platonus-parser'
type Library={section:StudySection|null;capturedAt:string|null}
type Connection={status:string;credentialsSaved:boolean;error:string|null}
export function UmkdPage({onMenuClick,onConnect}:{onMenuClick:()=>void;onConnect:()=>void}){
 useLanguage();
 const group=useGroup(),[own,setOwn]=useState<Library|null>(null),[shared,setShared]=useState<Library|null>(null),[connection,setConnection]=useState<Connection|null>(null),[source,setSource]=useState<'own'|'group'|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const load=useCallback(async()=>{const [mine,state,common]=await Promise.all([requestApi<Library>('/api/platonus/umkd'),requestApi<Connection>('/api/platonus/connection'),group?.data.group?requestApi<Library>('/api/groups/umkd'):Promise.resolve(null)]);setOwn(mine);setConnection(state);setShared(common);setSource(previous=>previous??(mine.section?.links.length?'own':common?.section?'group':'own'));return state},[group?.data.group?.id])
 useEffect(()=>{let active=true;void load().catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[load])
 const data=source==='group'?shared:own,working=busy||connection?.status==='syncing'
 async function refresh(){if(source==='own'&&!connection?.credentialsSaved){onConnect();return}setBusy(true);setError('');try{if(source==='own'&&connection?.status==='connected'){await requestApi('/api/platonus/sync',{method:'POST'});setConnection(c=>c?{...c,status:'syncing'}:c)}else await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 useEffect(()=>{if(connection?.status!=='syncing')return;const timer=setInterval(()=>void load().catch(e=>setError(e.message)),4000);return()=>clearInterval(timer)},[connection?.status,load])
 return <main className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6"><header className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={onMenuClick} aria-label={t("Открыть меню")} className="md:hidden"><Menu/></Button><h1 className="min-w-0 flex-1 text-xl font-semibold">{t("УМКД")}</h1><Button variant="ghost" size="icon" disabled={working} title={source==='group'?'Обновить материалы группы':t("Обновить УМКД")} aria-label={t("Обновить УМКД")} onClick={()=>void refresh()}><RefreshCw className={working?'size-4 animate-spin':'size-4'}/></Button></header>
 {own?.section&&shared?.section&&<label className="block text-sm">{t("Материалы")}<select className="ml-2 rounded-md border bg-background p-2" value={source??'own'} onChange={e=>setSource(e.target.value as 'own'|'group')}><option value="own">Мой Platonus</option><option value="group">Моя группа</option></select></label>}
 {error&&own&&<p role="alert" className="text-sm text-destructive">{error}</p>}{working&&<p role="status" className="text-xs text-muted-foreground">{t("Обновляем…")}</p>}
 {connection?.error&&source==='own'&&<p role="status" className="text-sm text-muted-foreground">{connection.error}</p>}
 {!own&&error?<ErrorState message={error} onRetry={()=>{setError('');void load().catch(e=>setError(e.message))}}/>:!own?<LoadingState/>:data?.section?<PlatonusUmkd key={source} section={data.section} apiBase={source==='group'?'/api/groups/umkd':'/api/platonus/umkd'}/>:<div className="space-y-3 rounded-lg border p-5"><p>{t("Учебных материалов пока нет.")}</p><p className="text-sm text-muted-foreground">{group?.data.group?'Староста может подключить источник УМКД в «Моей группе». Также можно подключить свой Platonus.':t("Подключите Platonus один раз — материалы будут обновляться автоматически.")}</p><Button variant="outline" onClick={onConnect}>{t("Подключить Platonus")}</Button></div>}
 </main>
}
