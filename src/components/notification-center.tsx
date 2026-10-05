import {useCallback,useEffect,useId,useRef,useState,type ReactNode} from 'react'
import {createPortal} from 'react-dom'
import {Bell,CalendarClock,CheckCheck,ChevronDown,GraduationCap,LifeBuoy,MessageCircleReply,Sparkles,Trash2,UserRound,X} from 'lucide-react'
import {useAccount} from './auth-gate'
import {requestApi} from '../lib/api-client'
import {t,useLanguage} from '../lib/language'
import {useDialogFocus} from '../hooks/use-dialog-focus'
import {gradeSubjectLabel} from '../lib/grade-data'
import {badgeCount,dayKey,isScheduleSummary,markTone,parseGradeBody,relativeTime,scheduleBadge,scheduleValues,scheduleWhen,studyPeriod,type ScheduleDetail} from '../lib/notification-format'
import {cn} from '../lib/utils'
import {Modal} from './ui/modal'
import {Button} from './ui/button'

type Notification={id:string;body:string;original:string|null;created_at:number;read_at:number|null;type?:'support'|'grade'|'schedule';ticket_id?:string|null;title?:string|null;study_year?:number|null;term?:number|null;kind?:string;subject?:string|null;lesson_date?:string|null;actor?:string|null;payload?:ScheduleDetail|null}
type Inbox={items:Notification[];unread:number;unreadByType?:{grade:number;support:number;schedule?:number}}
type Filter='all'|'unread'|'grade'|'schedule'|'support'
type CountKey='grade'|'schedule'|'support'
const countKey=(item:Notification):CountKey=>item.type==='grade'?'grade':item.type==='schedule'?'schedule':'support'
export type GradeFocus={subject:string;year?:number|null;term?:number|null}
type Reply={id:string;body:string;created_at:number;read_at:number|null}
type Ticket={id:string;kind:string;body:string;page:string;created_at:number;delivered:boolean;replies:Reply[]}
const RELEASE='2026-10-01-campus',RELEASE_DATE='2026-10-01'
// Только то, что видят студенты: изменения админки сюда не пишем.
const updates:[string,string][]=[
 ['Уведомления об изменениях расписания','Когда занятие отменяют, переносят, меняют аудиторию, время или преподавателя — в Platonus или в расписании вашей группы — в уведомлениях появится понятная карточка: что было и что стало. Нажмите на неё, чтобы открыть этот день в расписании.'],
 ['Праздники в расписании','Праздничные дни выделены в расписании, а занятия при этом остаются видны.'],
 ['Неделя на телефоне как на ПК','В расписании на неделю включите вид «Как на ПК» — вся неделя поместится на экран телефона.'],
 ['Оценки по датам','В разделе «Оценки» у каждого предмета есть список всех оценок по датам и среднее значение.'],
 ['AI-помощник отвечает на вопросы','Спросите о расписании, заданиях или учёбе — помощник ответит, а не только внесёт изменения.'],
 ['Задания, заметки и файлы к занятиям','Добавляйте домашнее задание, заметки и файлы к занятию вручную или через AI-помощника, в том числе прикладывая файлы к сообщению.'],
 ['Моя группа','Групповое расписание и участники группы отображаются понятнее, а настройки группы стали удобнее.'],
 ['Уведомления','Фильтры, «Прочитать все», удаление уведомлений и отдельное окно «Помощь и обратная связь».'],
]
const locale=(language:string)=>language==='kk'?'kk-KZ':language==='en'?'en-GB':'ru-RU'
const updatesKey=(user:string)=>`campus-updates-${user}`
function readSeen(user:string){try{return localStorage.getItem(updatesKey(user))===RELEASE}catch{return true}}

export function useNotifications(){
 const account=useAccount(),[unread,setUnread]=useState(0),[updatesNew,setUpdatesNew]=useState(()=>!readSeen(account.user.id))
 const refresh=useCallback(async()=>{try{const data=await requestApi<Inbox>('/api/notifications?unread=1');setUnread(data.unread)}catch{/* The panel exposes connection errors when opened. */}},[])
 useEffect(()=>{void refresh();const timer=setInterval(()=>{if(!document.hidden)void refresh()},60000);const visible=()=>{if(!document.hidden)void refresh()};const requested=()=>void refresh();document.addEventListener('visibilitychange',visible);window.addEventListener('campus-notifications-refresh',requested);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('campus-notifications-refresh',requested)}},[refresh])
 const seeUpdates=useCallback(()=>{try{localStorage.setItem(updatesKey(account.user.id),RELEASE)}catch{/* Private mode keeps the marker for this session only. */}setUpdatesNew(false)},[account.user.id])
 return {unread,updatesNew,refresh,seeUpdates}
}

export function CountBadge({count,dot=false,className}:{count:number;dot?:boolean;className?:string}){
 if(count>0)return <span aria-hidden className={cn('absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-background tabular-nums',className)}>{badgeCount(count)}</span>
 return dot?<span aria-hidden className={cn('absolute -right-1 -top-1 size-2 rounded-full bg-blue-500 ring-2 ring-background',className)}/>:null
}
export function bellLabel(unread:number,updatesNew:boolean){return `${t('Уведомления')}${unread?` · ${t('непрочитанных: {n}').replace('{n}',String(unread))}`:updatesNew?` · ${t('есть обновления Campus')}`:''}`}

export function SupportButtons({onNotifications,onSupport,unread,updatesNew}:{onNotifications:()=>void;onSupport:()=>void;unread:number;updatesNew:boolean}){
 useLanguage()
 const row='flex min-h-11 w-full items-center gap-3 rounded-md px-2.5 text-left text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground'
 return <>
  <button onClick={onNotifications} title={t('Уведомления')} aria-label={bellLabel(unread,updatesNew)} aria-haspopup="dialog" className={row}><span className="relative shrink-0"><Bell className="size-[17px]"/><CountBadge count={unread} dot={updatesNew}/></span><span className="sidebar-label flex-1">{t('Уведомления')}</span>{unread>0&&<span aria-hidden className="sidebar-label rounded-full bg-red-600/10 px-1.5 text-[11px] font-semibold text-red-700 tabular-nums dark:text-red-300">{badgeCount(unread)}</span>}</button>
  <button onClick={onSupport} title={t('Помощь и обратная связь')} aria-label={t('Помощь и обратная связь')} aria-haspopup="dialog" className={row}><LifeBuoy className="size-[17px] shrink-0"/><span className="sidebar-label">{t('Помощь и обратная связь')}</span></button>
 </>
}

/** Opens the grades page on the notification's period and highlights the subject once the journal renders. */
export function focusGradeSubject(user:string,focus:GradeFocus){
 if(focus.year&&focus.term)try{localStorage.setItem(`campus-journal-period:${user}`,JSON.stringify({year:focus.year,term:focus.term}))}catch{/* The grades page falls back to its default period. */}
 const name=gradeSubjectLabel(focus.subject).trim(),started=Date.now()
 const timer=setInterval(()=>{
  const heading=[...document.querySelectorAll<HTMLElement>('#main-content article h2')].find(item=>item.textContent?.trim()===name),card=heading?.closest('article')
  if(!card){if(Date.now()-started>15000)clearInterval(timer);return}
  clearInterval(timer);card.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})
  const marker=['ring-2','ring-blue-500','ring-offset-2','ring-offset-background'];card.classList.add(...marker);setTimeout(()=>card.classList.remove(...marker),3500)
 },300)
}

const filters:[Filter,string][]=[['all','Все'],['unread','Непрочитанные'],['schedule','Расписание'],['grade','Оценки'],['support','Ответы разработчика']]
export function NotificationPanel({onClose,onChanged,onOpenGrades,onOpenSchedule,onOpenSupport,updatesNew,onSeeUpdates}:{onClose:()=>void;onChanged:()=>void;onOpenGrades:(focus:GradeFocus)=>void;onOpenSchedule:(date:string|null,group:boolean)=>void;onOpenSupport:(ticket?:string|null)=>void;updatesNew:boolean;onSeeUpdates:()=>void}){
 const language=useLanguage(),ref=useRef<HTMLDivElement>(null),titleId=useId()
 const [filter,setFilter]=useState<Filter>('all'),[items,setItems]=useState<Notification[]>([]),[counts,setCounts]=useState({unread:0,grade:0,schedule:0,support:0}),[busy,setBusy]=useState(true),[error,setError]=useState(''),[more,setMore]=useState(false),[updatesOpen,setUpdatesOpen]=useState(false),[status,setStatus]=useState('')
 const generation=useRef(0)
 useDialogFocus(ref,true,onClose)
 const load=useCallback(async(before?:number)=>{
  const id=++generation.current;setBusy(true);setError('')
  try{
   const query=new URLSearchParams();if(before)query.set('before',String(before));if(filter==='unread')query.set('unread','1');if(filter==='grade'||filter==='support'||filter==='schedule')query.set('type',filter)
   const data=await requestApi<Inbox>(`/api/notifications${query.size?'?'+query:''}`)
   if(id!==generation.current)return
   setItems(old=>before?[...old,...data.items.filter(item=>!old.some(o=>o.id===item.id))]:data.items);setMore(data.items.length===30);setCounts({unread:data.unread,grade:data.unreadByType?.grade??0,schedule:data.unreadByType?.schedule??0,support:data.unreadByType?.support??0})
  }catch(e){if(id===generation.current)setError(e instanceof Error?e.message:t('Не удалось загрузить уведомления'))}finally{if(id===generation.current)setBusy(false)}
 },[filter])
 useEffect(()=>{void load()},[load])
 const markRead=async(item:Notification)=>{
  if(item.read_at)return
  setItems(old=>old.map(o=>o.id===item.id?{...o,read_at:Date.now()}:o));setCounts(old=>({...old,unread:Math.max(0,old.unread-1),[countKey(item)]:Math.max(0,old[countKey(item)]-1)}))
  try{await requestApi('/api/notifications/read',{method:'POST',body:JSON.stringify({ids:[item.id]})})}catch{/* The badge is corrected by the next refresh. */}
  onChanged()
 }
 const readAll=async()=>{
  setError('')
  try{await requestApi('/api/notifications/read',{method:'POST',body:JSON.stringify({all:true})});setItems(old=>old.map(o=>o.read_at?o:{...o,read_at:Date.now()}));setCounts({unread:0,grade:0,schedule:0,support:0});setStatus(t('Все уведомления прочитаны'));onChanged()}
  catch(e){setError(e instanceof Error?e.message:t('Не удалось отметить уведомления'))}
 }
 const remove=async(item:Notification)=>{
  const before=items;setItems(old=>old.filter(o=>o.id!==item.id));setError('')
  try{await requestApi(`/api/notifications/${encodeURIComponent(item.id)}`,{method:'DELETE'});setStatus(t('Уведомление удалено'));if(!item.read_at)void load();onChanged()}
  catch(e){setItems(before);setError(e instanceof Error?e.message:t('Не удалось удалить уведомление'))}
 }
 const clearRead=async()=>{
  setError('')
  try{const result=await requestApi<{removed:number}>('/api/notifications?scope=read',{method:'DELETE'});setStatus(result.removed?t('Прочитанные уведомления удалены'):t('Прочитанных уведомлений нет'));await load();onChanged()}
  catch(e){setError(e instanceof Error?e.message:t('Не удалось очистить уведомления'))}
 }
 const open=(item:Notification)=>{
  void markRead(item)
  if(item.type==='grade'){const grade=parseGradeBody(item.body);onOpenGrades({subject:grade?.subject??'',year:item.study_year,term:item.term})}
  else if(item.type==='schedule')onOpenSchedule(item.lesson_date??item.payload?.date??null,item.payload?.source==='group'||!!item.actor)
  else onOpenSupport(item.ticket_id)
 }
 const groups:[string,Notification[]][]=[];for(const item of items){const key=dayKey(item.created_at),last=groups.at(-1);if(last?.[0]===key)last[1].push(item);else groups.push([key,[item]])}
 const dayTitle=(key:string)=>key==='today'?t('Сегодня'):key==='yesterday'?t('Вчера'):new Date(Number(key)).toLocaleDateString(locale(language),{day:'numeric',month:'long',year:new Date(Number(key)).getFullYear()===new Date().getFullYear()?undefined:'numeric'})
 const pinned=typeof document!=='undefined'&&document.querySelector('.campus-sidebar')?.getAttribute('data-pinned')==='true'
 const hasRead=items.some(item=>item.read_at)
 const empty:Record<Filter,[string,string]>={all:['Пока нет уведомлений','Здесь появятся изменения расписания, новые оценки из Platonus и ответы разработчика на ваши обращения.'],unread:['Всё прочитано','Изменения расписания, новые оценки и ответы разработчика появятся здесь.'],schedule:['Изменений расписания нет','Если занятие отменят, перенесут или поменяют аудиторию, время или преподавателя, Campus покажет это здесь.'],grade:['Уведомлений об оценках нет','Когда в Platonus появится новая или изменённая оценка, Campus покажет её здесь.'],support:['Ответов разработчика нет','Если вы напишете разработчику, его ответ появится здесь.']}
 return createPortal(<div className="fixed inset-0 z-[100]">
  <button data-dialog-backdrop tabIndex={-1} aria-label={t('Закрыть')} className="absolute inset-0 bg-black/40 md:bg-black/10" onClick={onClose}/>
  <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={cn('absolute inset-0 flex flex-col overflow-hidden bg-background pb-[env(safe-area-inset-bottom)] shadow-2xl md:inset-auto md:bottom-3 md:max-h-[min(760px,calc(100dvh-24px))] md:w-[440px] md:rounded-xl md:border',pinned?'md:left-[238px]':'md:left-[78px]')}>
   <header className="shrink-0 space-y-3 border-b px-4 pb-3 pt-4">
    <div className="flex items-center gap-2"><h2 id={titleId} className="min-w-0 flex-1 text-base font-semibold">{t('Уведомления')}{counts.unread>0&&<span className="ml-2 inline-grid h-5 min-w-5 place-items-center whitespace-nowrap rounded-full bg-red-600 px-1.5 align-middle text-[11px] font-semibold text-white tabular-nums" title={t('непрочитанных: {n}').replace('{n}',String(counts.unread))}><span aria-hidden>{counts.unread}</span><span className="sr-only">{t('непрочитанных: {n}').replace('{n}',String(counts.unread))}</span></span>}</h2>
     <Button variant="ghost" size="sm" className="shrink-0" disabled={!counts.unread} onClick={()=>void readAll()}><CheckCheck className="mr-1.5 size-4"/>{t('Прочитать все')}</Button>
     <Button variant="ghost" size="icon" className="shrink-0" aria-label={t('Закрыть')} onClick={onClose}><X/></Button></div>
    <div role="group" aria-label={t('Фильтр уведомлений')} className="flex flex-wrap gap-1.5">{filters.map(([id,label])=>{const count=id==='unread'?counts.unread:id==='all'?0:counts[id];return <button key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)} className={cn('flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',filter===id?'border-foreground bg-foreground text-background':'text-muted-foreground hover:bg-muted hover:text-foreground')}>{t(label)}{count>0&&<span className={cn('rounded-full px-1.5 text-[10px] tabular-nums',filter===id?'bg-background/20':'bg-muted')}>{badgeCount(count)}</span>}</button>})}</div>
   </header>
   <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
    <p role="status" className="sr-only">{status}</p>
    {filter==='all'&&<section className="border-b px-4 py-3" aria-label={t('Обновления Campus')}>
     <button aria-expanded={updatesOpen} onClick={()=>{setUpdatesOpen(v=>!v);if(!updatesOpen)onSeeUpdates()}} className="flex w-full items-center gap-3 rounded-lg text-left"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-violet-500/15 text-violet-700 dark:text-violet-300"><Sparkles className="size-4"/></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{t('Обновления Campus')}{updatesNew&&<span className="ml-2 rounded-full bg-blue-600 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-white">{t('Новое')}</span>}</span><span className="block text-xs text-muted-foreground">{t('Что появилось в Campus')} · <time dateTime={RELEASE_DATE}>{new Date(RELEASE_DATE+'T00:00:00').toLocaleDateString(locale(language),{day:'numeric',month:'long'})}</time></span></span><ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform',updatesOpen&&'rotate-180')}/></button>
     {updatesOpen&&<ul className="mt-3 space-y-2">{updates.map(([title,description])=><li key={title} className="rounded-lg bg-muted/60 p-3"><p className="text-sm font-medium">{t(title)}</p><p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{t(description)}</p></li>)}</ul>}
    </section>}
    {error&&<div role="alert" className="m-4 rounded-lg border border-destructive/40 p-3 text-sm text-destructive"><p>{error}</p><Button size="sm" variant="outline" className="mt-2" onClick={()=>void load()}>{t('Повторить')}</Button></div>}
    {busy&&!items.length&&<p role="status" className="p-6 text-center text-sm text-muted-foreground">{t('Загрузка…')}</p>}
    {!busy&&!error&&!items.length&&<div className="flex flex-col items-center px-6 py-10 text-center"><span className="mb-3 grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"><Bell className="size-5"/></span><p className="font-medium">{t(empty[filter][0])}</p><p className="mt-1 max-w-72 text-sm text-muted-foreground">{t(empty[filter][1])}</p>{filter==='support'&&<Button size="sm" variant="outline" className="mt-4" onClick={()=>onOpenSupport(null)}>{t('Написать разработчику')}</Button>}</div>}
    {groups.map(([key,list])=><section key={key} aria-label={dayTitle(key)}><h3 className="sticky top-0 z-10 bg-background/95 px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">{dayTitle(key)}</h3><ul>{list.map(item=><NotificationRow key={item.id} item={item} language={language} onOpen={()=>open(item)} onRemove={()=>void remove(item)}/>)}</ul></section>)}
    {more&&!error&&<div className="p-4"><Button variant="outline" className="w-full" disabled={busy} onClick={()=>void load(items.at(-1)?.created_at)}>{busy?t('Загрузка…'):t('Показать ещё')}</Button></div>}
   </div>
   {hasRead&&<footer className="shrink-0 border-t px-4 py-2"><Button variant="ghost" size="sm" className="text-muted-foreground" onClick={()=>void clearRead()}><Trash2 className="mr-1.5 size-4"/>{t('Очистить прочитанные')}</Button></footer>}
  </div>
 </div>,document.getElementById('root')??document.body)
}

function ScheduleBadge({kind}:{kind:string}){const [label,tone]=scheduleBadge(kind);return <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-4',tone)}>{t(label)}</span>}
function ScheduleValues({detail}:{detail:ScheduleDetail}){
 const values=scheduleValues(detail);if(!values)return null
 return <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px]">{values.before&&<s className="break-words text-muted-foreground decoration-1">{values.before}</s>}{values.before&&values.after&&<span aria-label={t('изменено на')} className="text-muted-foreground">→</span>}{values.after&&<span className="break-words font-medium text-foreground">{values.after}</span>}</span>
}
const whenLabels=()=>({pair:t('{n} пара'),weekly:'{day}',since:t('с {date}')})
function NotificationRow({item,language,onOpen,onRemove}:{item:Notification;language:string;onOpen:()=>void;onRemove:()=>void}){
 const unread=!item.read_at,grade=item.type==='grade'?parseGradeBody(item.body):null,time=relativeTime(item.created_at,locale(language)),full=new Date(item.created_at).toLocaleString(locale(language)),[expanded,setExpanded]=useState(false)
 const schedule=item.type==='schedule',kind=item.kind??'',summary=schedule&&isScheduleSummary(kind),detail:ScheduleDetail={kind,subject:item.subject??'',date:item.lesson_date??null,...(item.payload??{})},changes=summary?item.payload?.changes??[]:[]
 const category=item.type==='grade'?(grade?.before?t('Оценка изменена'):t('Новая оценка')):schedule?t(item.title??'Изменения расписания'):t('Ответ разработчика')
 let content:ReactNode
 if(schedule){const when=scheduleWhen(detail,locale(language),whenLabels()),source=detail.source==='platonus'?t('Из Platonus'):item.actor
  content=summary?<>
   <span className={cn('block break-words text-sm',unread?'font-semibold':'font-medium')}>{t(item.title??'Изменения расписания')}</span>
   <span className="mt-1 block break-words text-[13px] text-muted-foreground">{item.body}</span></>:<>
   <span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className={cn('min-w-0 break-words text-[15px] leading-5',unread?'font-semibold':'font-medium')}>{detail.subject||item.title}</span><ScheduleBadge kind={kind}/></span>
   <ScheduleValues detail={detail}/>
   {when&&<span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock aria-hidden className="size-3.5 shrink-0"/><span>{when}</span></span>}
   {source&&<span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><UserRound aria-hidden className="size-3.5 shrink-0"/><span className="break-words">{source}</span></span>}</>
 }
 else if(item.type==='grade')content=grade?<>
  <span className={cn('block break-words text-sm',unread?'font-semibold':'font-medium')}>{gradeSubjectLabel(grade.subject)}</span>
  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">{grade.before&&<><span className={cn('rounded-md px-1.5 py-0.5 font-semibold tabular-nums line-through decoration-1 opacity-70',markTone(grade.before))}>{grade.before}</span><span aria-label={t('изменена на')}>→</span></>}<span className={cn('rounded-md px-2 py-0.5 text-sm font-bold tabular-nums',markTone(grade.mark))}>{grade.mark}</span>{grade.point&&<span className="text-foreground/80">{grade.point}</span>}{grade.date&&<span>· {grade.date}</span>}</span>
  {item.study_year?<span className="mt-1 block text-[11px] text-muted-foreground">{studyPeriod(item.study_year,item.term,t('{n} семестр'))}</span>:null}</>
  :<><span className={cn('block break-words text-sm',unread?'font-semibold':'font-medium')}>{item.body}</span><span className="mt-1 block text-[11px] text-muted-foreground">{item.original}</span></>
 else content=<>
  <span className={cn('block text-sm',unread?'font-semibold':'font-medium')}>{t('Разработчик ответил на ваше обращение')}</span>
  <span className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-[13px] text-foreground/90">{item.body}</span>
  {item.original&&<span className="mt-1 block truncate text-xs text-muted-foreground">{t('Ваше обращение')}: «{item.original}»</span>}</>
 const Icon=item.type==='grade'?GraduationCap:schedule?CalendarClock:MessageCircleReply
 return <li className={cn('group relative border-b last:border-b-0',unread&&'bg-blue-500/[0.04]')}>
  <button onClick={onOpen} className="flex w-full min-w-0 items-start gap-3 px-4 py-3 text-left hover:bg-muted/60 focus-visible:bg-muted/60">
   <span className="sr-only">{category}{unread?` · ${t('не прочитано')}`:''}</span>
   <span className={cn('mt-0.5 grid size-9 shrink-0 place-items-center rounded-full',item.type==='grade'?'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300':schedule?'bg-orange-500/15 text-orange-700 dark:text-orange-300':'bg-blue-500/15 text-blue-700 dark:text-blue-300')}><Icon className="size-4"/></span>
   <span className="min-w-0 flex-1 pr-7">
    <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground"><span className="min-w-0 truncate font-medium uppercase tracking-wide">{item.type==='grade'?t('Оценки'):schedule?t('Изменения расписания'):t('Ответ разработчика')}</span><span aria-hidden>·</span><time className="shrink-0 whitespace-nowrap" dateTime={new Date(item.created_at).toISOString()} title={full}>{time}</time>{unread&&<span className="ml-auto size-2 shrink-0 rounded-full bg-blue-600" aria-hidden/>}</span>
    <span className="mt-1 block">{content}</span>
    <span className="mt-1.5 block text-xs font-medium text-blue-700 dark:text-blue-300">{item.type==='grade'?t('Открыть оценки'):schedule?t('Открыть в расписании'):t('Открыть переписку')}</span>
   </span>
  </button>
  {changes.length>0&&<div className="-mt-1 pb-3 pl-16 pr-4">
   <button aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)} className="flex min-h-8 items-center gap-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground"><ChevronDown aria-hidden className={cn('size-4 transition-transform',expanded&&'rotate-180')}/>{expanded?t('Скрыть изменения'):t('Показать изменения ({n})').replace('{n}',String(changes.length))}</button>
   {expanded&&<ul className="mt-1.5 space-y-1.5">{changes.map(change=><li key={JSON.stringify([change.kind,change.subject,change.date,change.weekday,change.slot,change.from,change.to])} className="rounded-md bg-muted/60 px-2.5 py-2">
    <span className="flex flex-wrap items-center gap-1.5"><span className="break-words text-[13px] font-medium">{change.subject}</span><ScheduleBadge kind={change.kind}/></span>
    <ScheduleValues detail={change}/>
    <span className="mt-0.5 block text-xs text-muted-foreground">{scheduleWhen(change,locale(language),whenLabels())}</span>
   </li>)}</ul>}
  </div>}
  <Button variant="ghost" size="icon" className="absolute right-2 top-9 size-8 text-muted-foreground md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100" aria-label={t('Удалить уведомление')} title={t('Удалить уведомление')} onClick={onRemove}><Trash2 className="size-4"/></Button>
 </li>
}

export function SupportDialog({page,ticket,onClose,onChanged}:{page:string;ticket?:string|null;onClose:()=>void;onChanged:()=>void}){
 const language=useLanguage()
 const [tab,setTab]=useState<'new'|'history'>(ticket?'history':'new'),[tickets,setTickets]=useState<Ticket[]|null>(null),[listError,setListError]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[kind,setKind]=useState('bug'),[body,setBody]=useState(''),[sent,setSent]=useState(false)
 const loadTickets=useCallback(async()=>{
  setListError('')
  try{const data=await requestApi<{tickets:Ticket[]}>('/api/support');setTickets(data.tickets)
   const unread=data.tickets.flatMap(item=>item.replies.filter(reply=>!reply.read_at).map(reply=>reply.id))
   for(let i=0;i<unread.length;i+=30)await requestApi('/api/notifications/read',{method:'POST',body:JSON.stringify({ids:unread.slice(i,i+30)})}).catch(()=>{})
   if(unread.length)onChanged()
  }catch(e){setListError(e instanceof Error?e.message:t('Не удалось загрузить обращения'))}
 },[onChanged])
 useEffect(()=>{void loadTickets()},[loadTickets])
 useEffect(()=>{if(tab==='history'&&ticket&&tickets)requestAnimationFrame(()=>document.getElementById(`ticket-${ticket}`)?.scrollIntoView({block:'start'}))},[tab,ticket,tickets])
 async function send(){
  setBusy(true);setError('')
  try{await requestApi('/api/support',{method:'POST',body:JSON.stringify({kind,body,page})});setSent(true);setBody('');void loadTickets()}
  catch(e){setError(e instanceof Error?e.message:t('Не удалось отправить обращение'))}finally{setBusy(false)}
 }
 const when=(time:number)=>new Date(time).toLocaleString(locale(language),{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})
 return <Modal title={t('Помощь и обратная связь')} onClose={onClose}>
  <div role="group" aria-label={t('Раздел')} className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">{([['new','Написать разработчику'],['history','Мои обращения']] as const).map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>setTab(id)} className={cn('min-h-9 rounded-md px-2 text-sm font-medium',tab===id?'bg-background shadow-sm':'text-muted-foreground hover:text-foreground')}>{t(label)}{id==='history'&&tickets?.length?<span className="ml-1 text-muted-foreground tabular-nums">{tickets.length}</span>:null}</button>)}</div>
  {tab==='new'?sent?<div role="status" className="space-y-3"><p className="font-medium">{t('Обращение отправлено')}</p><p className="text-sm text-muted-foreground">{t('Когда разработчик ответит, в уведомлениях появится ответ, а вся переписка будет в разделе «Мои обращения».')}</p><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>setSent(false)}>{t('Написать ещё')}</Button><Button variant="ghost" onClick={()=>setTab('history')}>{t('Мои обращения')}</Button></div></div>:<form className="space-y-4" onSubmit={e=>{e.preventDefault();void send()}}>
   <p className="text-sm text-muted-foreground">{t('Нашли ошибку или есть идея? Опишите её — разработчик прочитает и ответит здесь.')}</p>
   {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
   <label className="block space-y-2 text-sm"><span>{t('Тип обращения')}</span><select className="w-full rounded-lg border bg-background p-3" value={kind} onChange={e=>setKind(e.target.value)}><option value="bug">{t('Сообщить об ошибке')}</option><option value="idea">{t('Предложить улучшение')}</option></select></label>
   <label className="block space-y-2 text-sm"><span>{t('Что произошло или что улучшить?')}</span><textarea required minLength={10} maxLength={3000} rows={6} className="w-full resize-y rounded-lg border bg-background p-3" value={body} onChange={e=>setBody(e.target.value)} placeholder={t('Опишите, что вы нажали, что ожидали и что получилось.')}/></label>
   <p className="text-xs text-muted-foreground">{t('Разработчику отправятся этот текст и название текущего раздела. Не указывайте пароли и личную переписку.')}</p>
   <Button type="submit" disabled={busy||body.trim().length<10}>{busy?t('Отправляем…'):t('Отправить')}</Button>
  </form>:<div className="space-y-3">
   {listError&&<div role="alert" className="text-sm text-destructive"><p>{listError}</p><Button size="sm" variant="outline" className="mt-2" onClick={()=>void loadTickets()}>{t('Повторить')}</Button></div>}
   {!tickets&&!listError&&<p role="status" className="text-sm text-muted-foreground">{t('Загрузка…')}</p>}
   {tickets&&!tickets.length&&<div className="py-6 text-center"><p className="font-medium">{t('Обращений пока нет')}</p><p className="mt-1 text-sm text-muted-foreground">{t('Здесь будут ваши сообщения разработчику и его ответы.')}</p><Button variant="outline" className="mt-4" onClick={()=>setTab('new')}>{t('Написать разработчику')}</Button></div>}
   {tickets?.map(item=><article key={item.id} id={`ticket-${item.id}`} className={cn('scroll-mt-2 rounded-lg border p-3',item.id===ticket&&'ring-2 ring-blue-500')}>
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"><span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">{item.kind==='bug'?t('Ошибка'):t('Предложение')}</span><time dateTime={new Date(item.created_at).toISOString()}>{when(item.created_at)}</time><span className="ml-auto">{item.replies.length?t('Есть ответ'):item.delivered?t('Отправлено разработчику'):t('Ожидает отправки')}</span></div>
    <p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.body}</p>
    {item.replies.map(reply=><div key={reply.id} className="mt-3 rounded-lg bg-blue-500/10 p-3"><p className="mb-1 flex flex-wrap gap-x-2 text-xs font-medium text-blue-700 dark:text-blue-300"><span>{t('Ответ разработчика')}</span><time className="font-normal text-muted-foreground" dateTime={new Date(reply.created_at).toISOString()}>{when(reply.created_at)}</time></p><p className="whitespace-pre-wrap break-words text-sm">{reply.body}</p></div>)}
   </article>)}
  </div>}
 </Modal>
}
