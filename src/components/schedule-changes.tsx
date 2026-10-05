import {t,useLanguage} from '../lib/language'
import {useEffect,useState} from 'react'
import {requestApi} from '../lib/api-client'
import {Modal} from './ui/modal'
import {Button} from './ui/button'
import {LoadingState,ErrorState} from './ui/page-state'
import type {PreviewRow} from './platonus-schedule-preview'
type Data={snapshot:{id:string;capturedAt:string}|null;rows:PreviewRow[];campusOnly:Record<string,unknown>[]}
const days=['','Пн','Вт','Ср','Чт','Пт','Сб','Вс']
const details=(v:Record<string,unknown>)=>[v.subject,v.start_time&&`${v.start_time}–${v.end_time}`,v.teacher,v.lesson_type,v.building,v.room].filter(Boolean).join(' · ')||'Нет занятия'
export function ScheduleChanges({onClose,onReviewed,onApplied}:{onClose:()=>void;onReviewed:()=>void;onApplied:()=>Promise<void>}){
 useLanguage()
 const [data,setData]=useState<Data|null>(null),[selected,setSelected]=useState<Set<number>>(new Set()),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 async function load(){setError('');try{const d=await requestApi<Data>('/api/platonus');setData(d);setSelected(new Set(d.rows.filter(r=>['add','update'].includes(r.status)).map(r=>r.index)))}catch(e){setError((e as Error).message)}}
 useEffect(()=>{void load()},[])
 async function review(){if(!data?.snapshot)return;await requestApi('/api/platonus/acknowledge',{method:'POST',body:JSON.stringify({snapshotId:data.snapshot.id})});onReviewed()}
 async function act(apply:boolean){setBusy(true);setError('');try{if(apply){let count=0;for(const row of data?.rows??[]){if(!selected.has(row.index))continue;await requestApi('/api/platonus/import',{method:'POST',body:JSON.stringify({snapshotId:data!.snapshot!.id,index:row.index,revision:row.revision})});count++}await onApplied();setNotice(`Применено занятий: ${count}. Остальные записи сохранены. Откат доступен в истории импорта Platonus.`)}await review();if(!apply)onClose();else await load()}catch(e){setError((e as Error).message);await onApplied();/* Keep the review open and notification pending after partial failure. */}finally{setBusy(false)}}
 const changed=data?.rows.filter(r=>r.status!=='unchanged')??[]
 return <Modal wide title={t("Изменения расписания Platonus")} onClose={()=>{if(!busy)onClose()}}>
 <div className="space-y-4"><p className="text-sm text-muted-foreground">{t("Сравнение последнего расписания Platonus с вашим расписанием в Campus. Выберите, что перенести. Личные занятия автоматически не удаляются.")}</p>
 {error&&<ErrorState message={error} onRetry={()=>void load()}/>}{notice&&<p role="status" className="rounded-lg border border-primary p-3 text-sm">{notice}</p>}
 {!data&&!error&&<LoadingState/>}{data&&!data.snapshot&&<p>Расписание Platonus ещё не получено.</p>}
 {data?.snapshot&&<><p className="text-xs text-muted-foreground">Получено: {new Date(data.snapshot.capturedAt).toLocaleString()}</p>
 {!changed.length&&<p className="rounded-lg border p-4">Занятия из Platonus уже совпадают с Campus. Можно закрыть уведомление кнопкой ниже.</p>}
 {changed.map(row=><article key={row.index} className="space-y-3 rounded-lg border p-3"><div className="flex items-start gap-3">{row.status!=='conflict'&&<input aria-label={`Применить ${row.lesson.subject} ${days[row.lesson.weekday]} ${row.lesson.slotNumber}`} type="checkbox" className="mt-1 size-4" disabled={busy} checked={selected.has(row.index)} onChange={e=>setSelected(old=>{const next=new Set(old);if(e.target.checked)next.add(row.index);else next.delete(row.index);return next})}/>}<div><h3 className="font-medium">{days[row.lesson.weekday]}, {row.lesson.slotNumber}-я пара · {row.weekType==='odd'?'Числитель':'Знаменатель'}</h3><p className="text-xs text-muted-foreground">{row.status==='add'?'Новое занятие':row.status==='update'?'Изменились данные занятия':'Пересечение с вашим расписанием'}</p></div></div><div className="grid gap-3 text-sm sm:grid-cols-2"><div className="rounded-md bg-muted p-3"><p className="mb-1 text-xs text-muted-foreground">{t("Сейчас в Campus")}</p><p className="break-words">{row.existing?details(row.existing):row.collisions.length?row.collisions.map(details).join('; '):'Нет занятия'}</p></div><div className="rounded-md border border-primary/40 p-3"><p className="mb-1 text-xs text-muted-foreground">{t("В Platonus")}</p><p className="break-words">{[row.lesson.subject,`${row.lesson.startTime}–${row.lesson.endTime}`,row.lesson.teacher,row.lesson.lessonType,row.lesson.building,row.lesson.room].filter(Boolean).join(' · ')}</p></div></div>{row.status==='conflict'&&<p className="text-xs text-amber-700 dark:text-amber-300">Сохранено ваше занятие. Измените его вручную в редакторе расписания, если нужно.</p>}</article>)}
 {!!data.campusOnly?.length&&<details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">Только в Campus ({data.campusOnly.length}) — остаются без изменений</summary><p className="mt-2 text-xs text-muted-foreground">Это могут быть личные занятия или записи, которых больше нет в Platonus. Они не удаляются автоматически.</p>{data.campusOnly.map((r,i)=><p key={i} className="mt-2 break-words text-sm">{days[Number(r.weekday)]} · {r.week_type==='odd'?'Числитель':r.week_type==='even'?'Знаменатель':'Обе недели'} · {details(r)}</p>)}</details>}
 <div className="sticky bottom-0 flex flex-wrap gap-2 border-t bg-background py-3"><Button disabled={busy||!selected.size} onClick={()=>void act(true)}>{busy?'Сохраняем…':`Применить выбранные (${selected.size})`}</Button><Button variant="outline" disabled={busy} onClick={()=>void act(false)}>{changed.length?'Оставить моё расписание и убрать уведомление':'Всё просмотрено — убрать уведомление'}</Button></div></>}
 </div></Modal>
}
