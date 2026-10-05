import {AccountActivity} from './components/install-guide'
const ScheduleChanges=lazy(()=>import('./components/schedule-changes').then(m=>({default:m.ScheduleChanges})))
import {NotificationPanel,SupportDialog,CountBadge,bellLabel,focusGradeSubject,useNotifications} from './components/notification-center'
import {t,useLanguage} from './lib/language'
const GradesPage=lazy(()=>import('./components/grades-page').then(m=>({default:m.GradesPage})))
const WelcomeTour=lazy(()=>import('./components/welcome-tour').then(m=>({default:m.WelcomeTour})))
import {useFeature} from './lib/features'
const UmkdPage=lazy(()=>import('./components/umkd-page').then(m=>({default:m.UmkdPage})))
import {requestApi} from './lib/api-client'
import {GroupGate,useGroup} from './components/group-context'
const GroupPage=lazy(()=>import('./components/group-page').then(m=>({default:m.GroupPage})))
const PlatonusPage=lazy(()=>import('./components/platonus-page').then(m=>({default:m.PlatonusPage})))
const PeopleSettings=lazy(()=>import('./components/people-settings').then(m=>({default:m.PeopleSettings})))
import { Button } from './components/ui/button'
import { Menu,CalendarDays,MessageSquare,BookOpen,CircleHelp,CheckSquare2,Bell } from 'lucide-react'
const HistoryPage=lazy(()=>import('./components/history-page').then(m=>({default:m.HistoryPage})))
const AssistantPage=lazy(()=>import('./components/assistant-page').then(m=>({default:m.AssistantPage})))
import { AuthGate,useAccount } from './components/auth-gate'
const AdminPanel=lazy(()=>import('./components/admin-panel').then(m=>({default:m.AdminPanel})))
const ResourcePage=lazy(()=>import('./components/resource-page').then(m=>({default:m.ResourcePage})))
import { ErrorState,LoadingState } from './components/ui/page-state'
import { lazy,Suspense,useCallback,useEffect,useState } from 'react'
import { AppSidebar, type AppPage } from './components/app-sidebar'
const MessagesPage=lazy(()=>import('./components/messages-page').then(m=>({default:m.MessagesPage})))
const ProcessingPage=lazy(()=>import('./components/processing-page').then(m=>({default:m.ProcessingPage})))
import { ScheduleOverview } from './components/schedule-overview'
const SettingsPage=lazy(()=>import('./components/settings-page').then(m=>({default:m.SettingsPage})))
import { useAppSettings } from './hooks/use-app-settings'
import { useLessonOverrides } from './hooks/use-lesson-overrides'

function App() {
 const account=useAccount()
 const language=useLanguage();
  const group=useGroup()
  const [notificationsOpen,setNotificationsOpen]=useState(false),[support,setSupport]=useState<{ticket?:string|null}|null>(null)
  const {unread,updatesNew,refresh:refreshNotifications,seeUpdates}=useNotifications()
  const openNotifications=()=>{setMobileMenuOpen(false);setNotificationsOpen(true)},openSupport=(ticket?:string|null)=>{setMobileMenuOpen(false);setNotificationsOpen(false);setSupport({ticket})}
  const groupsEnabled=useFeature('groups'),aiEnabled=useFeature('ai'),tasksEnabled=useFeature('tasks')
  const [tourSection,setTourSection]=useState<'all'|'schedule'|'assistant'|'library'>('all'),[tourDone,setTourDone]=useState<string[]>([])
  useEffect(()=>{void requestApi<{sections:string[]}>('/api/tutorial').then(v=>setTourDone(v.sections)).catch(()=>{})},[])
  const [tour,setTour]=useState(()=>sessionStorage.getItem('campus-start-tour')==='1')
  const [platonusChanged,setPlatonusChanged]=useState(false)
  const [changesOpen,setChangesOpen]=useState(false),[scheduleRevision,setScheduleRevision]=useState(0)
  useEffect(()=>{const open=()=>setChangesOpen(true);window.addEventListener('campus-review-schedule',open);return()=>window.removeEventListener('campus-review-schedule',open)},[])
  useEffect(()=>{let active=true;const check=()=>void requestApi<{scheduleChanged:boolean}>('/api/platonus/connection').then(r=>{if(active)setPlatonusChanged(r.scheduleChanged)}).catch(()=>{});check();const timer=setInterval(check,60000);return()=>{active=false;clearInterval(timer)}},[])
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activePage, setActivePage] = useState<AppPage>(()=>{const path=location.pathname.replace(/\/+$/,'')||'/';if(path==='/admin')return account.user.isAdmin?'admin':'schedule';const saved=sessionStorage.getItem('campus-active-page') as AppPage;if(saved==='platonus'){sessionStorage.setItem('campus-settings-section','platonus');return 'settings'}return ['messages','processing','people','admin'].includes(saved)||(!tasksEnabled&&['tasks','materials'].includes(saved))||(!aiEnabled&&saved==='assistant')||(!groupsEnabled&&saved==='group')?'schedule':saved||'schedule'})
  useEffect(()=>{if(location.pathname.startsWith('/admin')&&!account.user.isAdmin)history.replaceState(null,'','/')},[account.user.isAdmin])
  useEffect(()=>{if(!tour)void requestApi('/api/activity/event',{method:'POST',body:JSON.stringify({id:crypto.randomUUID(),page:activePage})}).catch(()=>{})},[activePage,tour])
  const { overrides, updateOverride, revertOverride, syncError, refreshOverrides } = useLessonOverrides()
  const { settings, updateSettings, syncError: settingsError } = useAppSettings()

  const closeMenu = useCallback(() => setMobileMenuOpen(false), [])
  useEffect(() => { document.title = `${t(({ group:'Моя группа',library:'УМКД',grades:'Оценки',platonus:'Platonus', people:'Люди и роли', history: 'История изменений', assistant: 'Чат с AI', schedule: 'Расписание', tasks: 'Задания', materials: 'Материалы', messages: 'Сообщения', processing: 'Обработка', admin:'Администратор',settings: 'Настройки' })[activePage])} · Campus` }, [activePage,language])
  useEffect(() => { const media = window.matchMedia('(min-width: 768px)'); const close = () => { if (media.matches) closeMenu() }; media.addEventListener('change', close); return () => media.removeEventListener('change', close) }, [closeMenu])
  const navigate = useCallback((page: AppPage) => { if((page==='assistant'&&!aiEnabled)||(!tasksEnabled&&['tasks','materials'].includes(page))||['messages','processing','people','admin'].includes(page))page='schedule'; if(page==='platonus'){sessionStorage.setItem('campus-settings-section','platonus');page='settings'} if(location.pathname==='/admin')history.pushState(null,'','/');setActivePage(page);sessionStorage.setItem('campus-active-page',page);if(group?.scope==='all'&&page!=='schedule')group.choose('group');closeMenu();window.requestAnimationFrame(()=>{document.getElementById('main-content')?.focus({preventScroll:true});window.scrollTo({top:0})})},[closeMenu,group,aiEnabled,tasksEnabled])
  useEffect(()=>{const start=()=>{setTourSection('all');setTour(true);navigate('schedule')};window.addEventListener('campus-start-tour',start);return()=>window.removeEventListener('campus-start-tour',start)},[navigate])
  const navigateFromMenu=(page:AppPage)=>{if(tour){setTour(false);sessionStorage.removeItem('campus-start-tour')}navigate(page)}
  const content = activePage==='admin'&&account.user.isAdmin?<AdminPanel embedded onClose={()=>navigate('settings')}/> : groupsEnabled&&activePage === 'group' ? <GroupPage/> : activePage==='grades' ? <GradesPage onMenuClick={()=>setMobileMenuOpen(true)} onConnect={()=>navigate('platonus')}/> : activePage==='library' ? <UmkdPage onMenuClick={()=>setMobileMenuOpen(true)} onConnect={()=>navigate('platonus')}/> : activePage === 'platonus' ? <PlatonusPage onMenuClick={() => setMobileMenuOpen(true)}/> : activePage === 'people' ? <main className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6"><header className="flex items-center gap-3"><Button variant="ghost" size="icon" className="md:hidden" onClick={()=>setMobileMenuOpen(true)} aria-label={t("Открыть меню")}><Menu/></Button><h1 className="text-xl font-semibold">{t("Люди и роли")}</h1></header><PeopleSettings/></main> : activePage === 'history'  ? <HistoryPage onMenuClick={() => setMobileMenuOpen(true)} onRefresh={refreshOverrides}/> : aiEnabled&&activePage === 'assistant' ? <AssistantPage demoMode={tour} onMenuClick={() => setMobileMenuOpen(true)} onRefresh={refreshOverrides} /> : activePage === 'tasks' || activePage === 'materials' ? <ResourcePage key={activePage} kind={activePage} onMenuClick={() => setMobileMenuOpen(true)} /> : activePage === 'messages' ? (
    <MessagesPage
      onMenuClick={() => setMobileMenuOpen(true)}
      overrides={overrides}
      onUpdateOverride={updateOverride}
      onRevertOverride={revertOverride}
    />
  ) : activePage === 'processing' ? (
    <ProcessingPage
      onMenuClick={() => setMobileMenuOpen(true)}
      onRefresh={refreshOverrides}
    />
  ) : activePage === 'settings' ? (
    <><SettingsPage
      onMenuClick={() => setMobileMenuOpen(true)}
      settings={settings}
      onUpdate={updateSettings}
    /></>
  ) : (
    <ScheduleOverview key={scheduleRevision}
      onMenuClick={() => setMobileMenuOpen(true)}
      overrides={overrides}
      onUpdateOverride={updateOverride}
      onRevertOverride={revertOverride}
      settings={settings}
    />
  )

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AccountActivity page={activePage} paused={tour||activePage==='admin'||changesOpen||!!support||notificationsOpen}/>
      {changesOpen&&<Suspense fallback={null}><ScheduleChanges onClose={()=>setChangesOpen(false)} onReviewed={()=>setPlatonusChanged(false)} onApplied={async()=>{setScheduleRevision(n=>n+1);await refreshOverrides()}}/></Suspense>}
      {notificationsOpen&&<NotificationPanel onClose={()=>setNotificationsOpen(false)} onChanged={refreshNotifications} updatesNew={updatesNew} onSeeUpdates={seeUpdates} onOpenSupport={openSupport} onOpenGrades={focus=>{setNotificationsOpen(false);navigate('grades');if(focus.subject)focusGradeSubject(account.user.id,focus)}} onOpenSchedule={(date,fromGroup)=>{setNotificationsOpen(false);if(date){sessionStorage.setItem('campus-schedule-date',date);sessionStorage.setItem('campus-schedule-view','day')}setScheduleRevision(v=>v+1);navigate('schedule');if(fromGroup&&group?.data.group&&group.scope==='personal')group.choose('group')}}/>}
      {support&&<SupportDialog page={activePage} ticket={support.ticket} onClose={()=>setSupport(null)} onChanged={refreshNotifications}/>}
      
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-card focus:p-3">{t("Перейти к содержимому")}</a>
      <AppSidebar onNotifications={openNotifications} onSupport={()=>openSupport()} unread={unread} updatesNew={updatesNew} activePage={activePage} onNavigate={navigateFromMenu} />
      <AppSidebar onNotifications={openNotifications} onSupport={()=>openSupport()} unread={unread} updatesNew={updatesNew} mobile open={mobileMenuOpen} onClose={closeMenu} activePage={activePage} onNavigate={navigateFromMenu} />
      <div id="main-content" tabIndex={-1} className="min-h-screen pb-20 md:pb-0 md:pl-[70px]">{platonusChanged&&<div role="status" className="flex flex-wrap items-center gap-3 border-b px-4 py-2 text-sm"><span>В Platonus изменилось ваше расписание.</span><Button variant="outline" onClick={()=>setChangesOpen(true)}>Проверить изменения</Button></div>}{syncError && activePage!=='schedule' && <div className="px-4 pt-4"><ErrorState message={syncError} onRetry={() => void refreshOverrides()} /></div>}{settingsError && settingsError!==syncError && <div className="px-4 pt-4"><ErrorState message={settingsError} /></div>}<Suspense fallback={<div className="p-5"><LoadingState/></div>}>{!tour&&['schedule','library'].includes(activePage)&&!tourDone.includes(activePage)&&<div className="mx-auto flex max-w-5xl justify-end px-4 pt-3"><Button variant="ghost" size="sm" onClick={()=>{setTourSection(activePage as 'schedule'|'assistant'|'library');setTour(true)}}><CircleHelp className="mr-2 size-4"/>Как пользоваться</Button></div>}{tour?<WelcomeTour section={tourSection} onComplete={()=>{void requestApi<{sections:string[]}>('/api/tutorial',{method:'POST',body:JSON.stringify({section:tourSection})}).then(v=>setTourDone(v.sections)).catch(()=>{})}} navigate={navigate} onClose={()=>{setTour(false);sessionStorage.removeItem('campus-start-tour');navigate('schedule')}}/>:content}</Suspense></div><nav aria-label={t("Мобильная навигация")} className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 gap-0.5 border-t bg-background/95 px-1 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">{([['schedule','Расписание'],[aiEnabled?'assistant':'grades',aiEnabled?'AI':'Оценки'],['library','УМКД']] as [AppPage,string][]).map(([id,name])=><Button key={id} className="h-auto min-h-12 min-w-0 flex-col gap-1 px-0.5 py-1.5 text-[10.5px] leading-tight tracking-tight" variant={activePage===id?'default':'ghost'} onClick={()=>navigateFromMenu(id)}>{id==='schedule'?<CalendarDays className="size-4"/>:id==='assistant'?<MessageSquare className="size-4"/>:id==='grades'?<CheckSquare2 className="size-4"/>:<BookOpen className="size-4"/>}<span className="w-full truncate">{t(name)}</span></Button>)}<Button className="h-auto min-h-12 min-w-0 flex-col gap-1 px-0.5 py-1.5 text-[10.5px] leading-tight tracking-tight" variant={notificationsOpen?'default':'ghost'} aria-haspopup="dialog" aria-label={bellLabel(unread,updatesNew)} onClick={openNotifications}><span className="relative"><Bell className="size-4"/><CountBadge count={unread} dot={updatesNew}/></span><span className="w-full truncate">{t("Уведомления")}</span></Button><Button className="h-auto min-h-12 min-w-0 flex-col gap-1 px-0.5 py-1.5 text-[10.5px] leading-tight tracking-tight" variant="ghost" onClick={()=>setMobileMenuOpen(true)}><Menu className="size-4"/><span className="w-full truncate">{t("Ещё")}</span></Button></nav>
    </div>
  )
}

export default function AuthenticatedApp() {
 useLanguage(); return <AuthGate><GroupGate><App /></GroupGate></AuthGate> }
