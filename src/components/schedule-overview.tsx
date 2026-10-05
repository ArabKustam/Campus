import {useFeature} from '../lib/features'
import {t,useLanguage,locale} from '../lib/language'
import {ScheduleEditor} from './schedule-editor'
import {useGroupReadOnly,ScopePicker,ScopeHelp,useGroup,subgroupLabel} from './group-context'
import { TeacherLink } from './teacher-profile'
import { LoadingState, ErrorState } from './ui/page-state'
import { lessonPhase, minutesUntilLesson, formatLessonDuration, getLessonProgress, getLiveLessons, lessonTimes, localClock } from '../lib/lesson-live'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Pencil,
  CalendarDays,
  CheckSquare2,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Menu,
  Paperclip,
} from 'lucide-react'
import {
  TIME_SLOTS,
  type LessonInstance,
  type LessonOverride,
  type LessonOverrideMap,
  type LessonState,
  type WeekType,
} from '../data/schedule'
import type { AppSettings } from '../hooks/use-app-settings'
import { campusApi } from '../lib/campus-api'
import { mapScheduleDay, lessonChangeLabels } from '../lib/schedule-api'
import {
  addDays,
  fromDateKey,
  formatFullDate,
  formatWeekRange,
  getAcademicWeek,

  getWeekDays,
  isSameDay,
  startOfWeek,
  toDateKey,
} from '../lib/schedule-date'
import { cn } from '../lib/utils'
import { holidayOn, holidaysInRange, type Holiday } from '../lib/holidays'
import { LessonDrawer } from './lesson-drawer'
import { Badge } from './ui/badge'
import { Button } from './ui/button'

const shortWeekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']


const stateLabels: Partial<Record<LessonState, string>> = {
  cancelled: 'Отменено',
  moved: 'Перенесено',
  online: 'Онлайн',
  important: 'Важно',
  exam: 'Контрольная / экзамен',
}

const stateBadgeStyles: Partial<Record<LessonState, string>> = {
  cancelled: 'border-red-200 bg-red-100/70 text-red-700',
  moved: 'border-amber-200 bg-amber-100/70 text-amber-700',
  online: 'border-sky-200 bg-sky-100/70 text-sky-700',
  important: 'border-violet-200 bg-violet-100/70 text-violet-700',
  exam: 'border-rose-200 bg-rose-100/70 text-rose-700',
}

export function lessonStatusStyle(state:LessonState='normal'){
 return ({cancelled:'border-red-300 bg-red-50 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/45 dark:hover:bg-red-950/65',moved:'border-amber-300 bg-amber-50 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/35 dark:hover:bg-amber-950/50',online:'border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/35',important:'border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/35',exam:'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/35'} as Partial<Record<LessonState,string>>)[state]
}

export const holidayLabel=(h:Holiday)=>h.transferred?`${t('Выходной за')} ${t(h.name)}`:t(h.name)
const holidayShort=(h:Holiday)=>h.transferred?`${t('Выходной за')} ${t(h.short)}`:t(h.short)
const holidayAria=(h:Holiday)=>`${t('Праздник')}: ${holidayLabel(h)}`
const shortDate=(key:string)=>new Intl.DateTimeFormat(locale(),{day:'numeric',month:'short'}).format(fromDateKey(key)).replace('.','')
const HolidayTag=({compact=false}:{compact?:boolean})=><span className={cn('inline-flex items-center rounded-full border border-dashed border-muted-foreground/50 bg-background/60 font-semibold text-muted-foreground',compact?'px-1 text-[7px] leading-[10px] sm:text-[9px]':'px-2 py-0.5 text-[11px]')}>{t('Праздник')}</span>

function HolidayBanner({holiday,hasLessons}:{holiday:Holiday;hasLessons:boolean}){
 useLanguage()
 return <div role="note" aria-label={holidayAria(holiday)} className={cn('relative mb-4 overflow-hidden rounded-xl border p-4 shadow-subtle sm:p-5',holiday.theme.banner)}>
  <span aria-hidden="true" className="pointer-events-none absolute -right-3 -top-4 select-none text-[72px] leading-none opacity-20 sm:text-[96px]">{holiday.emoji}</span>
  <div className="relative flex items-start gap-3"><span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-white/70 text-2xl shadow-sm dark:bg-white/10">{holiday.emoji}</span>
  <div className="min-w-0"><p className={cn('text-[11px] font-semibold uppercase tracking-wide',holiday.theme.text)}>{holiday.transferred?t('Перенесённый выходной'):t('Праздничный день')}</p>
  <h3 className="mt-0.5 break-words text-base font-semibold leading-snug text-foreground sm:text-lg">{holidayLabel(holiday)}</h3>
  {holiday.transferred&&holiday.forDate&&<p className="mt-0.5 text-xs text-muted-foreground">{t('Праздник выпал на')} {formatFullDate(fromDateKey(holiday.forDate)).toLocaleLowerCase(locale())}</p>}
  <p className={cn('mt-1.5 text-sm font-medium',holiday.theme.text)}>{t(holiday.greeting)}</p>
  {hasLessons&&<p className="mt-2 text-xs text-foreground/75 sm:text-sm">{t('Скорее всего, занятий нет — расписание показано на всякий случай.')}</p>}</div></div>
 </div>
}

// Праздники недели, склеенные в диапазоны: «🌸 21–23 мар — Наурыз мейрамы».
function WeekHolidayHint({from,to}:{from:string;to:string}){
 useLanguage()
 const runs:{first:Holiday;last:Holiday}[]=[]
 for(const h of holidaysInRange(from,to)){const prev=runs.at(-1);if(prev&&prev.last.label===h.label&&toDateKey(addDays(fromDateKey(prev.last.date),1))===h.date)prev.last=h;else runs.push({first:h,last:h})}
 if(!runs.length)return null
 return <p className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">{runs.map(({first,last})=>{const label=holidayLabel(first),text=first.transferred?label.charAt(0).toLocaleLowerCase(locale())+label.slice(1):label;return <span key={first.date} className="max-w-full"><span aria-hidden="true">{first.emoji} </span><span className={cn('whitespace-nowrap font-medium',first.theme.text)}>{first.date===last.date?shortDate(first.date):`${fromDateKey(first.date).getDate()}–${shortDate(last.date)}`}</span> — {text}</span>})}</p>
}

function Audience({lesson}:{lesson:LessonInstance}){
 useLanguage();return lesson.audience?<p className={cn('mb-2 rounded-md px-2 py-1 text-xs font-medium',lesson.isMine?'bg-primary/15 text-primary':'bg-muted text-muted-foreground')}>{lesson.audienceAll?'Для всех подгрупп':lesson.audience.map(subgroupLabel).join(' · ')}{!lesson.audienceAll&&(lesson.isMine?' · Моя подгруппа':' · Не моя подгруппа')}</p>:null}

function LessonPhaseLabel({lesson,now,timezone}:{lesson:LessonInstance;now:Date;timezone:string}) {
 const phase=lessonPhase(lesson,now,timezone)
 if(!phase)return null
 return <p className={cn('mb-2 text-xs tabular-nums',phase.kind==='break'?'font-semibold text-amber-800 dark:text-amber-200':'text-muted-foreground')}>{phase.kind==='break'?t('Перемена · продолжим через'):phase.kind==='first'?t('До перемены'):t('Вторая половина пары · осталось')} {formatLessonDuration(phase.remaining)}</p>
}

function LessonCard({ lesson, date, live, now, timezone, onSelect, holiday }: { holiday?: Holiday | null; now: Date; timezone: string; lesson: LessonInstance; date: Date; live: ReturnType<typeof getLiveLessons>; onSelect: () => void }) {
 useLanguage();
 const admin=useFeature('tasks')
  const state = lesson.state ?? 'normal'
  const changes = lessonChangeLabels(lesson)
  const current = live.current?.instanceId === lesson.instanceId
  const next = !live.current && live.next?.instanceId === lesson.instanceId
  const progress = current ? getLessonProgress(lesson, now, timezone) : null
  return (
    <div onClick={onSelect} className={cn('w-full min-w-0 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/40', current ? 'border-primary' : next ? 'ring-2 ring-blue-400/70 border-blue-400 dark:ring-blue-400/60' : 'border-border',lessonStatusStyle(state),state==='normal'&&changes.length>0&&lessonStatusStyle('moved'),holiday&&'cursor-pointer border-dashed opacity-70 hover:opacity-100 focus-within:opacity-100')}>
      <Audience lesson={lesson}/>
      {(holiday || current || next || stateLabels[state] || (admin && lesson.homework)) && <div className="mb-2 flex flex-wrap items-center gap-2">
        {holiday && <HolidayTag />}
        {current && <Badge className="border-primary/30 bg-primary/10 text-primary">{t("Сейчас")}</Badge>}
        {next && <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-200">{t("До начала")} {formatLessonDuration(minutesUntilLesson(lesson, now, timezone) ?? 0)}</Badge>}
        {stateLabels[state] && <Badge className={stateBadgeStyles[state]}>{t(stateLabels[state]??'')}</Badge>}
        {admin && lesson.homework && <span className="inline-flex items-center gap-1 text-xs font-medium"><CheckSquare2 className="size-3.5" />{t("Есть задание")}</span>}
      </div>}
      <h3 className={cn('break-words text-sm font-semibold leading-5 sm:text-base', state === 'cancelled' && 'text-red-800 line-through decoration-2 dark:text-red-200')}><button onClick={onSelect} className="text-left">{lesson.title}{lesson.type ? ` · ${t(lesson.type)}` : ""}</button></h3>
      <div className="mt-2 flex min-w-0 items-start gap-2 text-sm font-medium"><MapPin className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 break-words">{state === 'online' || /^(онлайн|online)$/i.test(lesson.room.trim()) ? t("Онлайн") : lesson.room === 'Аудитория не указана' ? t(lesson.room) : `${t('Кабинет')} ${lesson.room}`}{(state === 'online' ? lesson.room : !/^(онлайн|online)$/i.test(lesson.room.trim()) && lesson.building !== 'Корпус не указан' && lesson.building) && <span className="font-normal text-muted-foreground"> · {state === 'online' ? t(lesson.room) : lesson.building}</span>}</span></div>
      <p className="mt-1.5 break-words text-sm text-muted-foreground"><TeacherLink id={lesson.teacherId} name={lesson.teacher}/></p>
      {state === 'moved' && <p className="mt-2 text-xs font-medium text-amber-700">{t("Перенос:")} {lesson.override?.newDate ? formatFullDate(fromDateKey(lesson.override.newDate)) : formatFullDate(date)}{lesson.override?.newStart ? ` · ${lesson.override.newStart}` : ''}</p>}
      {changes.length>0&&state!=='moved'&&<p className="mt-2 text-xs font-semibold text-amber-800 dark:text-amber-200">{changes.map(t).join(' · ')}</p>}
      {lesson.materials && <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Paperclip className="size-3.5" />{t("Материалы занятия")}</p>}
      {progress && <div className="mt-3 border-t pt-3"><LessonPhaseLabel lesson={lesson} now={now} timezone={timezone}/>
        <div className="mb-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs tabular-nums"><span className="text-muted-foreground">{t("Прошло")} {formatLessonDuration(progress.elapsed)}</span><span className="font-medium">{t("Осталось")} {formatLessonDuration(progress.remaining)}</span></div>
        <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-primary/15"><div className="h-full rounded-full bg-primary" style={{ width: `${progress.percent}%` }} /></div>
      </div>}
      <span className="sr-only">{t("Открыть занятие.")} {formatFullDate(date)}{holiday ? `. ${holidayAria(holiday)}` : ''}</span>
    </div>
  )
}

export function DayTimeline({ selectedDate, lessons, onSelectLesson, now, timezone }: { selectedDate: Date; lessons: LessonInstance[]; onSelectLesson: (lesson: LessonInstance, date: Date) => void; now: Date; timezone: string }) {
 useLanguage();
  const live = getLiveLessons(toDateKey(selectedDate), lessons, now, timezone)
  const today = toDateKey(selectedDate) === localClock(now, timezone).date
  const holiday = holidayOn(toDateKey(selectedDate))
  return (
    <section aria-label={t("Расписание на день")}>
      {holiday && <HolidayBanner holiday={holiday} hasLessons={lessons.length > 0} />}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{formatFullDate(selectedDate)}{today ? ' · '+t('Сегодня') : ''}</h2>
        <span className="text-sm text-muted-foreground">{lessons.length ? `${lessons.length} ${lessons.length === 1 ? t("занятие") : lessons.length < 5 ? t("занятия") : t("занятий")}` : t("Свободный день")}</span>
      </div>
      {today && lessons.length > 0 && <p className="mb-4 text-sm text-muted-foreground">{live.current ? `${t('Сейчас')}: ${live.current.title}` : live.next ? t("Сейчас занятий нет") : t("На сегодня занятия закончились")}{live.next ? ` · ${t('Следующая')}: ${lessonTimes(live.next).start}` : ''}</p>}
      {lessons.length === 0 ? <div className="rounded-lg border bg-card px-5 py-12 text-center"><p className="text-sm font-medium">{t("Занятий нет")}</p><p className="mt-2 text-sm text-muted-foreground">{t("Выберите другой день или откройте неделю.")}</p></div> : <div className="space-y-3">{[...lessons].sort((a, b) => lessonTimes(a).start.localeCompare(lessonTimes(b).start)).map((lesson) => {
        const time = lessonTimes(lesson)
        return <div key={lesson.instanceId} className="grid grid-cols-[52px_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[70px_minmax(0,1fr)] sm:gap-4"><div className="pt-4 text-right text-xs tabular-nums"><p className="font-semibold">{time.start}</p><p className="mt-1 text-muted-foreground">{time.end}</p><p className="mt-2 text-muted-foreground">{lesson.slot} {t('Пара').toLocaleLowerCase()}</p></div><LessonCard lesson={lesson} date={selectedDate} live={live} now={now} timezone={timezone} holiday={holiday} onSelect={() => onSelectLesson(lesson, selectedDate)} /></div>
      })}</div>}
    </section>
  )
}

export function WeekLessonCard({lesson,now,timezone,onSelect,upcoming=false,compact=false,holiday=false}:{holiday?:boolean;lesson:LessonInstance;now:Date;timezone:string;onSelect:()=>void;upcoming?:boolean;compact?:boolean}){
 useLanguage();
 const admin=useFeature('tasks')
 const changes=lessonChangeLabels(lesson)
 const progress=getLessonProgress(lesson,now,timezone)
 return <div className={cn('relative isolate rounded-lg bg-card',compact&&'min-w-0 overflow-hidden',progress&&'bg-blue-500/20',upcoming&&'ring-2 ring-blue-400/70',holiday&&'opacity-70 hover:opacity-100 focus-within:opacity-100')}>
 {progress&&<svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible rounded-lg" preserveAspectRatio="none"><rect x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx="8" fill="none" stroke="currentColor" strokeWidth="2" pathLength="100" strokeDasharray={`${(progress.elapsed+now.getSeconds()/60)/(progress.elapsed+progress.remaining)*100} 100`} className="text-blue-500 dark:text-blue-400 motion-safe:transition-[stroke-dasharray] motion-safe:duration-1000 motion-safe:ease-linear"/></svg>}
 <div onClick={onSelect} className={cn('w-full min-w-0 rounded-lg border text-left hover:bg-muted/40',compact?'overflow-hidden p-1 sm:p-1.5 lg:p-2':'p-3',progress?'border-blue-500/40 dark:border-blue-400/40':'border-border',lessonStatusStyle(lesson.state),(lesson.state??'normal')==='normal'&&changes.length>0&&lessonStatusStyle('moved'),holiday&&'cursor-pointer border-dashed')}>
 {holiday&&<p className={compact?'mb-0.5':'mb-1'}><HolidayTag compact={compact}/></p>}
 {!compact&&<Audience lesson={lesson}/>} 
 {upcoming&&<p className={cn('font-semibold text-blue-700 dark:text-blue-200',compact?'mb-0.5 text-[7px] leading-[9px] sm:text-[9px]':'mb-1 text-xs')}>{t("До начала")} {formatLessonDuration(minutesUntilLesson(lesson,now,timezone)??0)}</p>}
 {!compact&&<LessonPhaseLabel lesson={lesson} now={now} timezone={timezone}/>} 
 {progress&&<p className={cn('font-semibold text-blue-600 dark:text-blue-300',compact?'mb-0.5 text-[7px] leading-[9px] sm:text-[9px]':'mb-1 text-xs')}>{compact?t("Сейчас"):t("Сейчас · осталось")} {compact?'':formatLessonDuration(progress.remaining)}</p>}
 <p className={cn('font-semibold',compact?'break-all text-[7px] leading-[9px] sm:text-[9px] sm:leading-3 lg:text-xs':'hyphens-auto break-words text-sm',lesson.state==='cancelled'&&'text-red-800 line-through decoration-2 dark:text-red-200')}><button onClick={onSelect} className={cn('max-w-full text-left',compact&&'min-w-0 break-all')}>{lesson.title}</button></p>
 {!compact&&<p className="mt-1 text-xs text-muted-foreground">{lesson.type||t("Тип не указан")}</p>}
 {!compact&&<p className="mt-1 break-words text-xs text-muted-foreground"><TeacherLink id={lesson.teacherId} name={lesson.teacher}/></p>}<p className={cn(compact?'mt-0.5 break-all text-[7px] leading-[9px] sm:text-[9px]':'mt-1 break-words text-xs')}>{lesson.room}</p>
 {stateLabels[lesson.state??'normal']&&<p className={cn('font-semibold',compact?'mt-0.5 text-[7px] leading-[9px] sm:text-[9px]':'mt-2 text-xs')}>{t(stateLabels[lesson.state??'normal']??'')}{!compact&&lesson.state==='moved'&&lesson.override?.newDate?` → ${formatFullDate(fromDateKey(lesson.override.newDate))}${lesson.override.newStart?` · ${lesson.override.newStart}`:''}`:''}</p>}
 {!compact&&changes.length>0&&lesson.state!=='moved'&&<p className="mt-2 text-xs font-semibold">{changes.map(t).join(' · ')}</p>}
 {!compact&&<p className="mt-1 text-xs">{lessonTimes(lesson).start}–{lessonTimes(lesson).end}</p>}{!compact&&admin&&lesson.homework&&<p className="mt-1 text-xs">{t("Есть задание")}</p>}
 </div></div>
}

const WEEK_TABLE_WIDTH=1050
function useMediaQuery(query:string){const [matches,setMatches]=useState(()=>typeof window!=='undefined'&&window.matchMedia(query).matches);useEffect(()=>{const media=window.matchMedia(query),update=()=>setMatches(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[query]);return matches}

// Рисует полную «компьютерную» таблицу фиксированной ширины и уменьшает её до ширины экрана, как отдалённая страница.
function ScaledToFit({width,children}:{width:number;children:ReactNode}){
 const outer=useRef<HTMLDivElement>(null),inner=useRef<HTMLDivElement>(null),[box,setBox]=useState({scale:1,width,height:0})
 useEffect(()=>{const o=outer.current,i=inner.current;if(!o||!i)return;const measure=()=>{const available=o.clientWidth,scale=Math.min(1,available/width),next={scale,width:Math.max(width,available),height:i.offsetHeight*scale};setBox(b=>b.scale===next.scale&&b.width===next.width&&b.height===next.height?b:next)};measure();const observer=new ResizeObserver(measure);observer.observe(o);observer.observe(i);return()=>observer.disconnect()},[width])
 return <div ref={outer} className="relative w-full overflow-hidden" style={{height:box.height||undefined}}><div ref={inner} style={{width:box.width,transform:box.scale<1?`scale(${box.scale})`:undefined,transformOrigin:'top left'}} className="absolute left-0 top-0">{children}</div></div>
}

function WeekGrid({ weekDate, lessonsByDate, onSelectLesson, now, timezone, layout }: { weekDate: Date; now: Date; timezone: string; layout:'scroll'|'fit'; lessonsByDate: Record<string, LessonInstance[]>; onSelectLesson: (lesson: LessonInstance, date: Date) => void }) {
 useLanguage();
  const weekDays = [...getWeekDays(weekDate), addDays(startOfWeek(weekDate), 6)]
  const today = localClock(now, timezone).date
  const live = getLiveLessons(today, lessonsByDate[today] ?? [], now, timezone)
  const isUpcoming = (lesson: LessonInstance) => !live.current && live.next?.instanceId === lesson.instanceId
  const slots=Array.from(new Set([...TIME_SLOTS.map((slot) => slot.number), ...Object.values(lessonsByDate).flat().map((lesson) => lesson.slot)])).sort((a, b) => a - b)
  const cols='grid-cols-[78px_repeat(7,minmax(128px,1fr))]'
  const table=<div className={layout==='fit'?'w-full':'min-w-[1050px]'}>
          <div className={cn('grid border-b border-border bg-muted/70',cols)}>
            <div className="border-r border-border p-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t("Пара")}</div>
            {weekDays.map((date, index) => { const holiday = holidayOn(toDateKey(date)); return (
              <div key={date.toISOString()} aria-label={holiday ? `${formatFullDate(date)}. ${holidayAria(holiday)}` : undefined} className={cn('min-w-0 border-r border-border p-3 text-center last:border-r-0', toDateKey(date)===today && 'bg-blue-50/70 dark:bg-blue-500/10', holiday && cn('px-2 py-2', holiday.theme.header))}>
                <p className={cn('text-xs font-semibold', toDateKey(date)===today ? 'text-blue-700 dark:text-blue-300' : 'text-foreground')}>{t(shortWeekdays[index])} · {date.getDate()}</p>
                {holiday && <p className={cn('mt-0.5 text-[11px] font-semibold leading-tight', holiday.theme.text)}><span aria-hidden="true">{holiday.emoji} </span>{holidayShort(holiday)}</p>}
              </div>
            )})}
          </div>
          {slots.map((number) => { const slot = TIME_SLOTS.find((item) => item.number === number) ?? { number, start: t('Доп.'), end: '' }; return (
            <div key={slot.number} className={cn('grid min-h-[112px] border-b border-border last:border-b-0',cols)}>
              <div className="border-r border-border px-3 py-4 text-right">
                <p className="text-[11px] font-semibold tabular-nums text-foreground">{slot.start}</p>
                <p className="text-[10px] tabular-nums text-muted-foreground">{slot.end}</p>
              </div>
              {weekDays.map((date) => { const holiday = holidayOn(toDateKey(date)); return <div key={toDateKey(date)} className={cn('min-w-0 space-y-2 border-r border-border p-2 last:border-r-0',toDateKey(date)===today&&'bg-blue-50/30 dark:bg-blue-500/5',holiday?.theme.cell)}>{(lessonsByDate[toDateKey(date)] ?? []).filter((lesson) => lesson.slot === slot.number).map((lesson) => <WeekLessonCard key={lesson.instanceId} holiday={!!holiday} upcoming={isUpcoming(lesson)} lesson={lesson} now={now} timezone={timezone} onSelect={() => onSelectLesson(lesson,date)} />)}</div>})}
            </div>
          )})}
        </div>

  return (
    <section aria-label={t("Расписание на неделю")} data-week-layout={layout} className="overflow-hidden rounded-lg border border-border bg-card shadow-subtle">{layout==='scroll'&&<p className="border-b px-3 py-2 text-xs text-muted-foreground md:hidden">{t("Листайте таблицу влево и вправо, чтобы увидеть все дни.")}</p>}{layout==='fit'&&<p className="border-b px-3 py-2 text-xs text-muted-foreground md:hidden">{t("Вся неделя целиком. Увеличьте двумя пальцами, чтобы рассмотреть детали.")}</p>}
      {layout==='fit'?<div role="region" aria-label={t("Вся неделя без горизонтальной прокрутки")}><ScaledToFit width={WEEK_TABLE_WIDTH}>{table}</ScaledToFit></div>:<div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("Таблица недели; прокрутите вправо для остальных дней")}>{table}</div>}
    </section>
  )
}

type ScheduleOverviewProps = {
  onMenuClick: () => void
  overrides: LessonOverrideMap
  onUpdateOverride: (instanceId: string, patch: Partial<LessonOverride>) => unknown
  onRevertOverride: (instanceId: string) => void
  settings: AppSettings
}

export function ScheduleOverview({ onMenuClick, onUpdateOverride, onRevertOverride, settings }: ScheduleOverviewProps) {
 useLanguage();
  const group=useGroup()
  const readOnly=useGroupReadOnly()
  const [editing,setEditing]=useState(false)
  const [view, setView] = useState<'day' | 'week'>(()=>sessionStorage.getItem('campus-schedule-view')==='week'?'week':'day')
  const [weekLayout,setWeekLayout]=useState<'scroll'|'fit'>(()=>{try{return localStorage.getItem('campus-week-layout')==='fit'?'fit':'scroll'}catch{return 'scroll'}})
  const desktop=useMediaQuery('(min-width: 768px)')
  const [selectedDate, setSelectedDate] = useState(() => fromDateKey(sessionStorage.getItem('campus-schedule-date')||localClock(new Date(), settings.timezone).date))
  useEffect(()=>{sessionStorage.setItem('campus-schedule-view',view);sessionStorage.setItem('campus-schedule-date',toDateKey(selectedDate))},[view,selectedDate])
  useEffect(()=>{try{localStorage.setItem('campus-week-layout',weekLayout)}catch{/* приватный режим */}},[weekLayout])
  const [openedLesson, setOpenedLesson] = useState<{ date: Date; instanceId: string } | null>(null)
  const weekKey = toDateKey(startOfWeek(selectedDate))
  const weekDays = useMemo(() => [...getWeekDays(fromDateKey(weekKey)), addDays(fromDateKey(weekKey), 6)], [weekKey])
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1_000); return () => window.clearInterval(timer) }, [])
  const todayKey = localClock(now, settings.timezone).date
  const previousToday = useRef(todayKey)
  useEffect(() => {
    const previous = previousToday.current
    previousToday.current = todayKey
    if (previous !== todayKey) setSelectedDate((date) => toDateKey(date) === previous ? fromDateKey(todayKey) : date)
  }, [todayKey])
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [weekMeta,setWeekMeta]=useState<Record<string,{type:WeekType;number:number}>>({})
  const [lessonsByDate, setLessonsByDate] = useState<Record<string, LessonInstance[]>>({})
  const [scheduleError, setScheduleError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setScheduleError(null)
    Promise.all(weekDays.map(async (date) => {
      const day = await campusApi.scheduleDay(toDateKey(date))
      return [day.date, mapScheduleDay(day),{type:day.weekType,number:day.weekNumber}] as const
    })).then((entries) => {
      if (!active) return
      setLessonsByDate(Object.fromEntries(entries.map(([date,lessons])=>[date,lessons])))
      setWeekMeta(Object.fromEntries(entries.map(([date,,meta])=>[date,meta])))
      setScheduleError(null)
    }).catch((error) => {
      if (active) setScheduleError(error instanceof Error ? error.message : t("Не удалось загрузить расписание"))
    })
    .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [weekDays, retry])
  const weekInfo = getAcademicWeek(selectedDate)
  const resolveWeekType = useCallback((date: Date): WeekType => {
    const selectedWeek = startOfWeek(date)
    const anchorWeek = startOfWeek(fromDateKey(settings.anchorWeekDate))
    const weekDistance = Math.round((selectedWeek.getTime() - anchorWeek.getTime()) / (7 * 86_400_000))
    const anchorType = settings.anchorWeekType
    let type: WeekType = Math.abs(weekDistance) % 2 === 0 ? anchorType : anchorType === 'odd' ? 'even' : 'odd'
    if (settings.temporaryParityEnabled) {
      const correctedWeek = startOfWeek(fromDateKey(settings.temporaryParityDate))
      if (selectedWeek.getTime() === correctedWeek.getTime()) type = settings.temporaryParityType
    }
    return type
  }, [settings.anchorWeekDate, settings.anchorWeekType, settings.temporaryParityDate, settings.temporaryParityEnabled, settings.temporaryParityType])
  const effectiveWeekType = weekMeta[toDateKey(selectedDate)]?.type??resolveWeekType(selectedDate)
  const selectedLesson = openedLesson
    ? (lessonsByDate[toDateKey(openedLesson.date)] ?? []).find((lesson) => lesson.instanceId === openedLesson.instanceId)
    : undefined

  const shiftWeek = (offset: number) => setSelectedDate((date) => addDays(date, offset * 7))
  const selectLesson = useCallback((lesson: LessonInstance, date: Date) => {
    if(group?.scope==='all'){group.choose(lesson.sourceScope??'group');return}
    setOpenedLesson({ date: new Date(date), instanceId: lesson.instanceId })
  }, [group])
  const closeLesson = useCallback(() => setOpenedLesson(null), [])
  const updateSelectedLesson = useCallback((patch: Partial<LessonOverride>) => {
    if (!openedLesson) return
    const saved = onUpdateOverride(openedLesson.instanceId, patch)
    const dateKey = toDateKey(openedLesson.date)
    setLessonsByDate((current) => ({
      ...current,
      [dateKey]: (current[dateKey] ?? []).map((lesson) => lesson.instanceId === openedLesson.instanceId ? {
        ...lesson,
        state: patch.status ?? lesson.state,
        building: patch.newBuilding || lesson.building,
        room: patch.newRoom || lesson.room,
        override: { ...lesson.override, ...patch },
      } : lesson),
    }))
    return saved
  }, [onUpdateOverride, openedLesson])
  const updateSelectedFlags = useCallback((flags: { homework?: boolean; materials?: boolean }) => {
    if (!openedLesson) return
    const dateKey = toDateKey(openedLesson.date)
    setLessonsByDate((current) => (current[dateKey] ?? []).some((lesson) => lesson.instanceId === openedLesson.instanceId && Object.entries(flags).some(([key, value]) => lesson[key as 'homework' | 'materials'] !== value)) ? { ...current, [dateKey]: current[dateKey].map((lesson) => lesson.instanceId === openedLesson.instanceId ? { ...lesson, ...flags } : lesson) } : current)
  }, [openedLesson])
  const revertSelectedLesson = useCallback(() => {
    if (!openedLesson) return
    onRevertOverride(openedLesson.instanceId)
    const dateKey = toDateKey(openedLesson.date)
    setLessonsByDate((current) => ({
      ...current,
      [dateKey]: (current[dateKey] ?? []).map((lesson) => lesson.instanceId === openedLesson.instanceId ? { ...lesson, state: 'normal', override: undefined } : lesson),
    }))
  }, [onRevertOverride, openedLesson])

  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="-ml-2 shrink-0 md:hidden" onClick={onMenuClick} aria-label={t("Открыть меню")}><Menu /></Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-[-0.03em] text-foreground sm:text-2xl">{t("Расписание")}</h1>
        </div>
        {!readOnly&&<Button variant={editing?'default':'outline'} size="sm" aria-label={editing?t("Готово"):t("Редактировать")} aria-pressed={editing} onClick={()=>setEditing(v=>!v)}><Pencil className="size-4"/><span className="hidden sm:inline">{editing?t("Готово"):t("Редактировать")}</span></Button>}
      </div>

      <div className="mb-4 space-y-2"><ScopePicker comparison purpose="Расписание"/><ScopeHelp/></div>
      <section className="mb-4">
        <div className="grid grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-2 sm:grid-cols-[40px_minmax(0,1fr)_40px] sm:gap-3">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => shiftWeek(-1)} aria-label={t("Предыдущая неделя")}><ChevronLeft /></Button>
          <div className="text-center">
            <p className="text-[13px] font-semibold tracking-[-0.01em] text-foreground sm:text-sm">{formatWeekRange(selectedDate)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {weekInfo.inPeriod ? `${t('Неделя')} №${weekMeta[toDateKey(selectedDate)]?.number??weekInfo.weekNumber} · ${effectiveWeekType === 'odd' ? t("числитель") : t("знаменатель")}${settings.temporaryParityEnabled && startOfWeek(selectedDate).getTime() === startOfWeek(fromDateKey(settings.temporaryParityDate)).getTime() ? ' · исправлено вручную' : ''}` : t("Вне учебного периода")}
            </p>
            <WeekHolidayHint from={weekKey} to={toDateKey(addDays(fromDateKey(weekKey), 6))} />
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => shiftWeek(1)} aria-label={t("Следующая неделя")}><ChevronRight /></Button>
            
          </div>
        </div>
        
      </section>

      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2"><div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-subtle" role="group" aria-label={t("Режим расписания")}>
          <button aria-pressed={view === 'day'} onClick={() => setView('day')} className={cn('flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors', view === 'day' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            <CalendarDays className="size-3.5" />{t("День")}</button>
          <button aria-pressed={view === 'week'} onClick={() => setView('week')} className={cn('h-8 rounded-md px-3 text-xs font-medium transition-colors', view === 'week' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}>{t("Неделя")}</button>
        </div>{view==='week'&&!desktop&&<div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-subtle" role="group" aria-label={t("Отображение недели")}><button aria-pressed={weekLayout==='scroll'} onClick={()=>setWeekLayout('scroll')} className={cn('h-8 rounded-md px-2.5 text-xs font-medium transition-colors',weekLayout==='scroll'?'bg-muted text-foreground':'text-muted-foreground hover:text-foreground')}>{t("Телефон")}</button><button aria-pressed={weekLayout==='fit'} onClick={()=>setWeekLayout('fit')} className={cn('h-8 rounded-md px-2.5 text-xs font-medium transition-colors',weekLayout==='fit'?'bg-muted text-foreground':'text-muted-foreground hover:text-foreground')}>{t("Как на ПК")}</button></div>}</div>
        <Button variant="outline" size="sm" onClick={() => setSelectedDate(fromDateKey(localClock(new Date(), settings.timezone).date))}>{t("Сегодня")}</Button>
      </div>

      {scheduleError && <ErrorState message={scheduleError} onRetry={() => setRetry((value) => value + 1)} />}

      <nav aria-label={t("Дни недели")} className="mb-5 grid grid-cols-7 overflow-hidden rounded-lg border border-border bg-card shadow-subtle">
        {weekDays.map((date, index) => {
          const selected = isSameDay(selectedDate, date)
          const today = toDateKey(date) === localClock(now, settings.timezone).date
          const holiday = holidayOn(toDateKey(date))
          return (
            <button
              key={date.toISOString()}
              aria-pressed={selected}
              aria-label={`${formatFullDate(date)}${today ? ', '+t('Сегодня') : ""}${holiday ? '. '+holidayAria(holiday) : ''}`}
              aria-current={today ? "date" : undefined}
              onClick={() => { setSelectedDate(date); setView('day') }}
              className={cn('relative flex min-w-0 flex-col items-center gap-0.5 border-r border-border py-2.5 text-xs transition-colors last:border-r-0 hover:bg-muted', selected && 'bg-blue-50/80 text-blue-700 hover:bg-blue-50/80 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/10', holiday && cn(holiday.theme.chip, 'hover:brightness-95 dark:hover:brightness-125', selected && 'ring-2 ring-inset ring-blue-500/70 dark:ring-blue-300/70'))}
            >
              <span className={cn('text-[10px] font-medium sm:text-[11px]', selected ? 'text-blue-600 dark:text-blue-300' : 'text-muted-foreground')}>{t(shortWeekdays[index])}</span>
              <span className="font-semibold tabular-nums">{date.getDate()}</span>
              {today && <span className="absolute bottom-0.5 h-1 w-4 rounded-full bg-blue-600 dark:bg-blue-300" />}
              {holiday && <span aria-hidden="true" title={holidayLabel(holiday)} className="absolute right-0.5 top-0.5 text-[11px] leading-none sm:right-1 sm:top-1">{holiday.emoji}</span>}
            </button>
          )
        })}
      </nav>

      {loading ? <LoadingState label={t("Загрузка расписания")} /> : scheduleError ? null : editing&&!readOnly ? <ScheduleEditor dates={view==='day'?[selectedDate]:weekDays} weekType={effectiveWeekType} lessonsByDate={lessonsByDate} onSaved={()=>setRetry(v=>v+1)} onStatus={selectLesson}/> : view === 'day' ? (
        <DayTimeline now={now} timezone={settings.timezone} selectedDate={selectedDate} lessons={lessonsByDate[toDateKey(selectedDate)] ?? []} onSelectLesson={selectLesson} />
      ) : (
        <WeekGrid now={now} timezone={settings.timezone} weekDate={selectedDate} layout={desktop?'fit':weekLayout} lessonsByDate={lessonsByDate} onSelectLesson={selectLesson} />
      )}



      {selectedLesson && openedLesson && (
        <LessonDrawer
          onTypeSaved={() => setRetry(value => value + 1)}
          lesson={selectedLesson}
          date={openedLesson.date}
          onClose={closeLesson}
          onUpdate={updateSelectedLesson}
          onContentChanged={updateSelectedFlags}
          onRevert={revertSelectedLesson}
        />
      )}
    </main>
  )
}
