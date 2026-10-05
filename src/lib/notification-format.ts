export type GradeNotice={subject:string;point:string;date:string;mark:string;before:string}
// Bodies are written by worker/services/platonus-journal.ts: "Предмет · РК1: 92", "Предмет · Текущий (23.09.2026): 100", "Предмет · РК1: 92 → 95".
export function parseGradeBody(body:string):GradeNotice|null{
 const match=/^(.+?)(?: · ([^:]+?))?(?: \((\d{2}\.\d{2}\.\d{4})\))?: ([^:→]+?)(?: → ([^:→]+))?$/.exec(body.trim())
 if(!match)return null
 const [,subject,point='',date='',first,second]=match
 return second?{subject,point,date,before:first.trim(),mark:second.trim()}:{subject,point,date,before:'',mark:first.trim()}
}
export function studyPeriod(year?:number|null,term?:number|null,label='{n} семестр'){return year?`${year}–${year+1}${term?` · ${label.replace('{n}',String(term))}`:''}`:''}
export function markTone(mark:string){const n=Number(mark.replace(',','.'));if(!Number.isFinite(n))return 'bg-muted text-foreground';return n>=90?'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300':n>=75?'bg-blue-500/15 text-blue-700 dark:text-blue-300':n>=50?'bg-amber-500/15 text-amber-700 dark:text-amber-300':'bg-red-500/15 text-red-700 dark:text-red-300'}
const startOfDay=(time:number)=>{const date=new Date(time);date.setHours(0,0,0,0);return date.getTime()}
export function dayKey(time:number,now=Date.now()){const days=Math.round((startOfDay(now)-startOfDay(time))/86400000);return days===0?'today':days===1?'yesterday':String(startOfDay(time))}
export function relativeTime(time:number,locale:string,now=Date.now()){
 const seconds=Math.max(0,Math.round((now-time)/1000)),format=new Intl.RelativeTimeFormat(locale,{numeric:'auto',style:'short'})
 if(seconds<60)return format.format(0,'second')
 if(seconds<3600)return format.format(-Math.floor(seconds/60),'minute')
 if(dayKey(time,now)==='today')return format.format(-Math.floor(seconds/3600),'hour')
 return new Date(time).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})
}
export function badgeCount(count:number){return count>9?'9+':String(count)}
/** Structured schedule change written by worker/services/schedule-notifications.ts (payload_json). */
export type ScheduleDetail={kind:string;subject:string;date:string|null;weekday?:number;slot?:number;time?:string|null;weekType?:string|null;from?:string|null;to?:string|null;text?:string;when?:string;source?:'platonus'|'group';count?:number;changes?:ScheduleDetail[]}
const scheduleBadgeMap:Record<string,[string,string]>={
 cancelled:['Отменено','bg-red-500/15 text-red-700 dark:text-red-300'],
 moved:['Перенос','bg-amber-500/20 text-amber-800 dark:text-amber-300'],
 room:['Аудитория','bg-sky-500/15 text-sky-700 dark:text-sky-300'],
 time:['Время','bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'],
 teacher:['Преподаватель','bg-violet-500/15 text-violet-700 dark:text-violet-300'],
 added:['Новое занятие','bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'],
 removed:['Убрано','bg-zinc-500/15 text-zinc-700 dark:text-zinc-300'],
 type:['Тип занятия','bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300'],
 online:['Онлайн','bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'],
 restored:['По расписанию','bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'],
 platonus_update:['Platonus','bg-orange-500/15 text-orange-700 dark:text-orange-300'],
 group_change:['Группа','bg-orange-500/15 text-orange-700 dark:text-orange-300'],
}
export function scheduleBadge(kind:string):[string,string]{return scheduleBadgeMap[kind]??['Изменение','bg-muted text-foreground']}
export const isScheduleSummary=(kind?:string|null)=>kind==='platonus_update'||kind==='group_change'
/** Old → new values worth striking through; cancellations and restorations have none. */
export function scheduleValues(detail:Pick<ScheduleDetail,'kind'|'from'|'to'>):{before:string;after:string}|null{
 if(['cancelled','online','restored'].includes(detail.kind))return null
 if(detail.kind==='removed')return detail.from?{before:detail.from,after:''}:null
 const before=detail.from?.trim()??'',after=detail.to?.trim()??''
 return before||after?{before,after}:null
}
/** "вт, 6 окт · 2 пара · 10:55" for a dated change, "по вторникам · 2 пара · с 6 окт" for a regular one. */
export function scheduleWhen(detail:Pick<ScheduleDetail,'date'|'weekday'|'slot'|'time'>,locale:string,labels:{pair:string;weekly:string;since:string}={pair:'{n} пара',weekly:'{day}',since:'с {date}'}){
 const date=detail.date?new Date(`${detail.date}T12:00:00`):null,parts:string[]=[]
 if(detail.weekday){
  const day=new Date(2024,0,detail.weekday).toLocaleDateString(locale,{weekday:'long'})
  parts.push(labels.weekly.replace('{day}',day))
 }else if(date)parts.push(date.toLocaleDateString(locale,{weekday:'short',day:'numeric',month:'short'}))
 if(detail.slot)parts.push(labels.pair.replace('{n}',String(detail.slot)))
 if(detail.time&&!detail.weekday)parts.push(detail.time)
 if(detail.weekday&&date)parts.push(labels.since.replace('{date}',date.toLocaleDateString(locale,{day:'numeric',month:'short'})))
 return parts.join(' · ')
}
