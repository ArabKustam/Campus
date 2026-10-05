import {t,useLanguage} from '../lib/language'
import {useGroup} from './group-context'
import {useEffect,useRef,useState} from 'react'
import {Pencil,Plus,X} from 'lucide-react'
import {TIME_SLOTS,type LessonInstance,type WeekType} from '../data/schedule'
import {requestApi} from '../lib/api-client'
import {formatFullDate,toDateKey} from '../lib/schedule-date'
import {useDialogFocus} from '../hooks/use-dialog-focus'
import {LessonTypeField} from './lesson-type-field'
import {Button} from './ui/button'
import {ErrorState,LoadingState} from './ui/page-state'

type Named={id:string;name:string}
type Slot={id:string;subjectId:string;teacherId:string|null;weekday:number;slotNumber:number;startTime:string;endTime:string;weekType:'both'|WeekType;lessonType:string|null;room:string|null;building:string|null;validFrom?:string|null;validUntil?:string|null}
type Catalog={subjects:Named[];teachers:Named[];slots:Slot[]}
const field='mt-1 w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm'
export function ScheduleEditor({dates,weekType,onSaved,onStatus,lessonsByDate}:{dates:Date[];weekType:WeekType;onSaved:()=>void;onStatus:(lesson:LessonInstance,date:Date)=>void;lessonsByDate:Record<string,LessonInstance[]>}){
 useLanguage();
 const group=useGroup(),isSub=!!group?.data.group&&!['personal','common','all'].includes(group.scope)&&(group.scope!=='group'||!!group.data.member?.subgroup_id)
 const [common,setCommon]=useState<{ids:string[];catalog:Catalog}|null>(null),[exclusionBusy,setExclusionBusy]=useState(false)
 useEffect(()=>{if(isSub)void requestApi<{ids:string[];catalog:Catalog}>('/api/groups/exclusions').then(setCommon).catch(e=>setError(e.message))},[isSub])
 async function toggleCommon(id:string,hidden:boolean){setExclusionBusy(true);setError('');try{const result=await requestApi<{ids:string[]}>('/api/groups/exclusions',{method:'POST',body:JSON.stringify({slotId:id,hidden})});setCommon(c=>c?{...c,ids:result.ids}:c);onSaved()}catch(e){setError((e as Error).message)}finally{setExclusionBusy(false)}}
 const [data,setData]=useState<Catalog|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[retry,setRetry]=useState(0)
 const [removed,setRemoved]=useState<{id:string;subject:string;weekday:number;slot_number:number;week_type:string}[]>([])
 useEffect(()=>{void requestApi<typeof removed>('/api/catalog/removals').then(setRemoved).catch(()=>{})},[retry])
 const [selection,setSelection]=useState<{slot:Slot;date:Date}|null>(null)
 useEffect(()=>{let active=true;requestApi<Catalog>('/api/catalog').then(result=>{if(active){setData(result);setError('')}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[retry])
 const numbers=Array.from(new Set([...TIME_SLOTS.map(s=>s.number),...(data?.slots.map(s=>s.slotNumber)??[])])).sort((a,b)=>a-b)
 function add(date:Date,number:number){
  const known=data?.slots.filter(s=>s.slotNumber===number)??[],times=new Set(known.map(s=>`${s.startTime}|${s.endTime}`)),fallback=TIME_SLOTS.find(s=>s.number===number)
  const startTime=times.size===1?known[0].startTime:fallback?.start??'',endTime=times.size===1?known[0].endTime:fallback?.end??''
  setSelection({date,slot:{id:'',subjectId:'',teacherId:null,weekday:date.getDay()||7,slotNumber:number,startTime,endTime,weekType,lessonType:null,room:null,building:null}})
 }
 if(!data)return error?<ErrorState message={error} onRetry={()=>setRetry(r=>r+1)}/>:<LoadingState label={t("Открываем редактор")}/>
 return <section aria-label={t("Редактор расписания")} className="space-y-3">
  <p className="text-sm text-muted-foreground">{t("Выберите пару, чтобы изменить её, или «Добавить». Сейчас редактируется")} {weekType==='even'?t("знаменатель"):t("числитель")}{t(". В форме можно выбрать обе недели.")}</p>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {!!removed.length&&<details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">Удалённые занятия ({removed.length})</summary>{removed.map(r=><div key={r.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm"><span>{r.subject} · {["Пн","Вт","Ср","Чт","Пт","Сб","Вс"][r.weekday-1]} · {r.slot_number}-я · {r.week_type==="odd"?"Числитель":r.week_type==="even"?"Знаменатель":"Обе недели"}</span><Button variant="outline" onClick={()=>void requestApi(`/api/catalog/removals/${r.id}/restore`,{method:"POST"}).then(()=>{setRetry(n=>n+1);onSaved()}).catch(e=>setError(e.message))}>Восстановить</Button></div>)}</details>}
  {notice&&<p role="status" className="text-sm text-primary">{notice}</p>}
  <div className={dates.length>1?'grid gap-3 sm:grid-cols-2 xl:grid-cols-3':'grid gap-3'}>{dates.map(date=>{
   const key=toDateKey(date),weekday=date.getDay()||7
   return <section key={key} className="min-w-0 rounded-lg border bg-card p-3"><h2 className="mb-3 text-sm font-semibold">{formatFullDate(date)}</h2><div className="space-y-2">{numbers.map(number=>{
    const slots=data.slots.filter(s=>s.weekday===weekday&&s.slotNumber===number&&(s.weekType==='both'||s.weekType===weekType)&&(!s.validFrom||s.validFrom<=key)&&(!s.validUntil||s.validUntil>=key))
    const inherited=common?.catalog.slots.filter(s=>s.weekday===weekday&&s.slotNumber===number&&(s.weekType==='both'||s.weekType===weekType)&&(!s.validFrom||s.validFrom<=key)&&(!s.validUntil||s.validUntil>=key))??[]
    return <div key={number} className="flex items-start gap-2"><span className="w-10 shrink-0 pt-3 text-xs text-muted-foreground">{number}{t("пара")}</span><div className="min-w-0 flex-1 space-y-2">{slots.map(slot=><button key={slot.id} className="flex w-full min-w-0 items-start gap-2 rounded-md border p-3 text-left hover:border-primary hover:bg-accent" onClick={()=>setSelection({date,slot})}><span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{data.subjects.find(s=>s.id===slot.subjectId)?.name??t("Предмет")}</span><span className="mt-1 block break-words text-xs text-muted-foreground">{slot.startTime}–{slot.endTime} · {slot.lessonType||t("Тип не указан")}{slot.room?` · ${slot.room}`:''}{slot.weekType==='both'?' · Каждую неделю':''}</span></span><Pencil className="size-3.5 shrink-0"/></button>)}{!slots.length&&inherited.map(s=><div key={s.id} className="rounded-md border bg-muted/40 p-3 text-sm"><p className={common?.ids.includes(s.id)?'line-through text-muted-foreground':'font-medium'}>{common?.catalog.subjects.find(c=>c.id===s.subjectId)?.name}</p><p className="mt-1 text-xs text-muted-foreground">{common?.ids.includes(s.id)?'В этой подгруппе не проводится':'Занятие для всех подгрупп'}</p><Button variant="ghost" size="sm" disabled={exclusionBusy} onClick={()=>void toggleCommon(s.id,!common?.ids.includes(s.id))}>{common?.ids.includes(s.id)?'Вернуть для подгруппы':'Не проводится у нас'}</Button></div>)}{!slots.length&&<button onClick={()=>add(date,number)} className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground hover:border-primary hover:text-primary"><Plus className="size-4"/>{inherited.length?'Другая пара для нас':t("Добавить")}<span className="sr-only"> · {formatFullDate(date)}, {number}{t("пара")}</span></button>}</div></div>
   })}</div><button className="mt-3 text-xs text-primary underline-offset-4 hover:underline" onClick={()=>add(date,Math.min(10,Math.max(...numbers)+1))}>{t("Добавить другую пару")}</button></section>
  })}</div>
  {selection&&<SlotForm key={selection.slot.id+toDateKey(selection.date)+selection.slot.slotNumber} data={data} slot={selection.slot} date={selection.date} onClose={()=>setSelection(null)} onSaved={()=>{setSelection(null);setNotice(t("Сохранено. Расписание обновлено."));setRetry(r=>r+1);onSaved()}} onStatus={(()=>{const lesson=lessonsByDate[toDateKey(selection.date)]?.find(l=>l.scheduleSlotId===selection.slot.id);return lesson?()=>{setSelection(null);onStatus(lesson,selection.date)}:undefined})()}/>}
 </section>
}
function SlotForm({data,slot,date,onClose,onSaved,onStatus}:{data:Catalog;slot:Slot;date:Date;onClose:()=>void;onSaved:()=>void;onStatus?:()=>void}){
 useLanguage();
 const [draft,setDraft]=useState(slot),[subject,setSubject]=useState(data.subjects.find(s=>s.id===slot.subjectId)?.name??''),[teacher,setTeacher]=useState(data.teachers.find(t=>t.id===slot.teacherId)?.name??'')
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),panel=useRef<HTMLDivElement>(null)
 useDialogFocus(panel,true,()=>{if(!busy)onClose()})
 const [deleting,setDeleting]=useState(false)
 const created=useRef(new Map<string,string>())
 function change(key:keyof Slot,value:string|number|null){setDraft(s=>({...s,[key]:value}))}
 async function namedId(kind:'subjects'|'teachers',name:string){
  const value=name.trim();if(!value)return null
  const existing=data[kind].find(r=>r.name.normalize('NFC').toLocaleLowerCase()===value.normalize('NFC').toLocaleLowerCase())
  const key=kind+':'+value
  if(existing)return existing.id
  if(created.current.has(key))return created.current.get(key)!
  const row=await requestApi<{id:string}>(`/api/catalog/${kind}`,{method:'POST',body:JSON.stringify(kind==='subjects'?{name:value,shortName:null,color:'#2563eb'}:{name:value,email:null})})
  created.current.set(key,row.id);return row.id
 }
 async function save(){setError('');if(draft.startTime>=draft.endTime){setError(t("Окончание должно быть позже начала."));return}setBusy(true);try{
  const subjectId=await namedId('subjects',subject),teacherId=await namedId('teachers',teacher)
  const {weekday,slotNumber,startTime,endTime,weekType,lessonType,building,room}=draft
  await requestApi(`/api/catalog/slots${slot.id?`/${encodeURIComponent(slot.id)}`:''}`,{method:slot.id?'PATCH':'POST',body:JSON.stringify({subjectId,teacherId,weekday,slotNumber,startTime,endTime,weekType,lessonType,building,room})});onSaved()
 }catch(e){setError(e instanceof Error?e.message:t("Не удалось сохранить занятие"))}finally{setBusy(false)}}
 function input(key:'startTime'|'endTime'|'room'|'building',label:string,type='text'){return <label className="min-w-0 text-sm">{label}<input className={field} type={type} required={type==='time'} maxLength={200} value={draft[key]??''} onChange={e=>change(key,e.target.value||null)}/></label>}
 return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3"><div ref={panel} role="dialog" aria-modal="true" aria-labelledby="slot-editor-title" className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-xl border bg-background p-4 shadow-xl sm:p-6">
  <div className="mb-3 flex items-center justify-between gap-2"><h2 id="slot-editor-title" className="text-lg font-semibold">{slot.id?t("Изменить"):t("Добавить")}{t("занятие")}</h2><Button variant="ghost" size="icon" disabled={busy} onClick={onClose} aria-label={t("Закрыть редактор")}><X/></Button></div>
  <p className="mb-4 text-sm text-muted-foreground">{formatFullDate(date)}{t("· Изменения в этой форме действуют на регулярное расписание")} {slot.validFrom?`с ${slot.validFrom}`:''}{slot.validUntil?` до ${slot.validUntil}`:''}.</p>
  <form onSubmit={e=>{e.preventDefault();void save()}}><fieldset disabled={busy} className="grid min-w-0 gap-3 sm:grid-cols-2">
   <label className="min-w-0 text-sm sm:col-span-2">{t("Предмет")}<input className={field} list="editor-subjects" required maxLength={200} value={subject} onChange={e=>setSubject(e.target.value)}/><datalist id="editor-subjects">{data.subjects.map(s=><option key={s.id} value={s.name}/>)}</datalist><span className="text-xs text-muted-foreground">{t("Выберите существующий или введите новый.")}</span></label>
   <label className="min-w-0 text-sm sm:col-span-2">{t("Преподаватель")}<input className={field} list="editor-teachers" maxLength={200} value={teacher} onChange={e=>setTeacher(e.target.value)}/><datalist id="editor-teachers">{data.teachers.map(t=><option key={t.id} value={t.name}/>)}</datalist></label>
   <label className="text-sm">{t("Номер пары")}<input className={field} type="number" min={1} max={10} required value={draft.slotNumber} onChange={e=>{const n=Number(e.target.value),time=TIME_SLOTS.find(s=>s.number===n);setDraft(s=>({...s,slotNumber:n,...(!slot.id&&time?{startTime:time.start,endTime:time.end}:{})}))}}/></label>
   <label className="text-sm">{t("Недели")}<select className={field} value={draft.weekType} onChange={e=>change('weekType',e.target.value)}><option value="odd">{t("Числитель")}</option><option value="even">{t("Знаменатель")}</option><option value="both">{t("Каждую неделю")}</option></select></label>
   <LessonTypeField value={draft.lessonType??''} onChange={v=>change('lessonType',v||null)}/><label className="text-sm">{t("День")}<select className={field} value={draft.weekday} onChange={e=>change('weekday',Number(e.target.value))}>{['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((d,i)=><option key={d} value={i+1}>{t(d)}</option>)}</select></label>
   {input('startTime',t("Начало"),'time')}{input('endTime',t("Окончание"),'time')}{input('room',t("Кабинет"))}{input('building',t("Корпус"))}
  </fieldset>{error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}<div className="mt-4 flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy?t("Сохраняем…"):t("Сохранить расписание")}</Button><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t("Закрыть")}</Button></div></form>
  {slot.id&&<div className="mt-4 border-t pt-4">{deleting?<div className="space-y-3"><p className="text-sm">Удалить «{subject}» из регулярного расписания? Это уберёт все повторения этой записи. Восстановление доступно в «Удалённых занятиях».</p><Button disabled={busy} className="bg-red-600 text-white" onClick={()=>{setBusy(true);void requestApi('/api/catalog/slots/'+encodeURIComponent(slot.id),{method:'DELETE'}).then(onSaved).catch(e=>setError(e.message)).finally(()=>setBusy(false))}}>Удалить занятие</Button><Button variant="ghost" onClick={()=>setDeleting(false)}>Не удалять</Button></div>:<Button variant="ghost" className="text-destructive" disabled={busy} onClick={()=>setDeleting(true)}>Удалить из расписания</Button>}</div>}
  {onStatus&&<div className="mt-4 border-t pt-4"><Button variant="outline" disabled={busy} onClick={onStatus}>{t("Статус / отмена на")} {date.toLocaleDateString('ru-RU',{day:'numeric',month:'long'})}</Button><p className="mt-2 text-xs text-muted-foreground">{t("Для изменения только одного занятия откройте его статус. Несохранённые поля формы не применятся.")}</p></div>}
 </div></div>
}
