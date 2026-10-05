import {useFeature} from '../lib/features'
import {t,useLanguage} from '../lib/language'
import {useGroupReadOnly,useGroup} from './group-context'
import { LessonTypeField } from './lesson-type-field'
import { TeacherLink } from './teacher-profile'
import { requestApi } from '../lib/api-client'
import { LessonHomework, LessonNotesFiles } from './lesson-files'
import { lessonTimes } from '../lib/lesson-live'
import { useDialogFocus } from '../hooks/use-dialog-focus'
import { useEffect, useRef, useState } from 'react'
import { MapPin, RotateCcw, UserRound, X } from 'lucide-react'
import { type LessonInstance, type LessonOverride } from '../data/schedule'
import { formatFullDate } from '../lib/schedule-date'
import { Button } from './ui/button'

const fieldClass = 'h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:border-blue-300 focus:ring-2 focus:ring-blue-100'

const statusOptions = [
  { value: 'normal', label: 'Обычная' },
  { value: 'cancelled', label: 'Отменена' },
  { value: 'moved', label: 'Перенесена' },
  { value: 'online', label: 'Онлайн' },
  { value: 'important', label: 'Важная' },
  { value: 'exam', label: 'Контрольная / экзамен' },
] as const

type LessonDrawerProps = {
  lesson: LessonInstance
  date: Date
  onClose: () => void
  /** Может вернуть Promise<boolean>: false — сохранить не удалось (для индикатора заметки). */
  onUpdate: (patch: Partial<LessonOverride>) => unknown
  onTypeSaved?: () => void
  onRevert: () => void
  /** Сообщает карточке расписания, есть ли открытые задания / файлы у занятия. */
  onContentChanged?: (flags: { homework?: boolean; materials?: boolean }) => void
}

export function LessonDrawer({ lesson, date, onClose, onUpdate, onRevert, onTypeSaved, onContentChanged }: LessonDrawerProps) {
 const admin=useFeature('tasks')
 useLanguage();
  const group=useGroup(),groupReadOnly=useGroupReadOnly()
  const inherited=lesson.sourceScope==='common'&&group?.scope!=='common'
  const readOnly=groupReadOnly||inherited
  const [lessonType,setLessonType]=useState(lesson.type??''),[typeBusy,setTypeBusy]=useState(false),[typeError,setTypeError]=useState('')
  useEffect(()=>{setLessonType(lesson.type??'')},[lesson.scheduleSlotId,lesson.type])
  const time = lessonTimes(lesson)
  const override = lesson.override ?? {}
  const status = override.status ?? lesson.state ?? 'normal'
  const lessonRef = lesson.scheduleSlotId ? { slotId: lesson.scheduleSlotId, subjectId: lesson.subjectId, date: lesson.instanceId.slice(0, 10) } : null

  const panel = useRef<HTMLElement>(null)
  useDialogFocus(panel, true, onClose)

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="lesson-drawer-title">
      <button className="absolute inset-0 bg-slate-950/20" onClick={onClose} tabIndex={-1} data-dialog-backdrop aria-label={t("Закрыть карточку занятия")} />
      <aside ref={panel} className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-border bg-background shadow-[-12px_0_30px_rgba(15,23,42,0.08)] sm:w-[430px]">
        <header className="flex items-start gap-3 border-b border-border bg-card px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">{t("Занятие")}</p>
            <h2 id="lesson-drawer-title" className="break-words text-lg font-semibold leading-6 tracking-[-0.02em] text-foreground">{lesson.title}</h2>
          </div>
          <Button variant="ghost" size="icon" className="-mr-2 shrink-0" onClick={onClose} aria-label={t("Закрыть")}><X /></Button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <section className="border-b border-border bg-card px-5 py-5">
            <dl className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
              <dt className="text-muted-foreground">{t("Дата")}</dt>
              <dd className="min-w-0 break-words font-medium text-foreground">{formatFullDate(date)}</dd>
              <dt className="text-muted-foreground">{t("Тип занятия")}</dt><dd className="font-medium">{lesson.type||t("Не указан")}</dd>
              <dt className="text-muted-foreground">{t("Время")}</dt>
              <dd className="font-medium tabular-nums text-foreground">{time.start} — {time.end}</dd>
              <dt className="text-muted-foreground">{t("Преподаватель")}</dt>
              <dd className="flex min-w-0 break-words items-start gap-2 font-medium text-foreground"><UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><TeacherLink id={lesson.teacherId} name={lesson.teacher}/></dd>
              {lesson.building&&lesson.building!=='Корпус не указан'&&<><dt className="text-muted-foreground">{t("Корпус")}</dt>
              <dd className="flex min-w-0 break-words items-start gap-2 font-medium text-foreground"><MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />{lesson.building}</dd></>}
              <dt className="text-muted-foreground">{t("Аудитория")}</dt>
              <dd className="min-w-0 break-words font-medium text-foreground">{lesson.room}</dd>
            </dl>
          </section>

          {inherited&&<div className="space-y-2 border-b px-5 py-4 text-sm"><p>Это занятие для всех подгрупп. Чтобы исключить его только у вашей подгруппы, откройте редактор расписания и нажмите «Не проводится у нас».</p>{['owner','head'].includes(group?.data.member?.role??'')&&<Button variant="outline" onClick={()=>group.choose('common')}>Редактировать для всех подгрупп</Button>}</div>}
          {lesson.onlineUrl && <a className="mx-5 mt-4 rounded-md border p-3 text-sm text-primary underline" href={lesson.onlineUrl} target="_blank" rel="noreferrer">{t("Подключиться к занятию")}</a>}
          {admin&&lessonRef&&<LessonHomework key={`hw-${lesson.instanceId}`} lesson={lessonRef} readOnly={readOnly} onChanged={count=>onContentChanged?.({ homework: count > 0 })} />}

          <LessonNotesFiles key={`notes-${lesson.instanceId}`} lesson={lessonRef ?? { slotId: '', date: lesson.instanceId.slice(0, 10) }} note={override.note ?? ''} readOnly={readOnly} filesEnabled={admin&&!!lessonRef} onSaveNote={note=>onUpdate({ note })} onChanged={count=>onContentChanged?.({ materials: count > 0 })} />
          <section className="border-b border-border px-5 py-5">
            <label htmlFor="lesson-status" className="mb-2 block text-sm font-semibold text-foreground">{t("Статус")}</label>
            <select
              disabled={readOnly}
              id="lesson-status"
              className={fieldClass}
              value={status}
              onChange={(event) => onUpdate({ status: event.target.value as LessonOverride['status'] })}
            >
              {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>

            {status === 'moved' && (
              <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3.5">
                <label className="col-span-2 text-xs font-medium text-amber-900">{t("Новая дата")}<input type="date" className={`${fieldClass} mt-1.5`} value={override.newDate ?? ''} onChange={(event) => onUpdate({ newDate: event.target.value })} />
                </label>
                <label className="text-xs font-medium text-amber-900">{t("Начало")}<input type="time" className={`${fieldClass} mt-1.5`} value={override.newStart ?? ''} onChange={(event) => onUpdate({ newStart: event.target.value })} />
                </label>
                <label className="text-xs font-medium text-amber-900">{t("Окончание")}<input type="time" className={`${fieldClass} mt-1.5`} value={override.newEnd ?? ''} onChange={(event) => onUpdate({ newEnd: event.target.value })} />
                </label>
                <label className="text-xs font-medium text-amber-900">{t("Новый корпус")}<input className={`${fieldClass} mt-1.5`} value={override.newBuilding ?? ''} placeholder={t("Например, корпус №2")} onChange={(event) => onUpdate({ newBuilding: event.target.value })} />
                </label>
                <label className="text-xs font-medium text-amber-900">{t("Новая аудитория")}<input className={`${fieldClass} mt-1.5`} value={override.newRoom ?? ''} placeholder={t("Аудитория")} onChange={(event) => onUpdate({ newRoom: event.target.value })} />
                </label>
              </div>
            )}
          </section>


          {!readOnly&&lesson.scheduleSlotId&&<form className="space-y-3 border-b px-5 py-4" onSubmit={event=>{event.preventDefault();setTypeBusy(true);setTypeError('');void requestApi(`/api/catalog/slots/${encodeURIComponent(lesson.scheduleSlotId!)}/type`,{method:'PATCH',body:JSON.stringify({lessonType:lessonType||null})}).then(()=>onTypeSaved?.()).catch(error=>setTypeError(error.message)).finally(()=>setTypeBusy(false))}}><LessonTypeField value={lessonType} onChange={setLessonType}/><p className="text-xs text-muted-foreground">{t("Тип сохраняется для этой пары в регулярном расписании.")}</p>{typeError&&<p role="alert" className="text-sm text-destructive">{typeError}</p>}<Button disabled={typeBusy||lessonType===(lesson.type??'')} type="submit">{typeBusy?t("Сохранение…"):t("Сохранить тип занятия")}</Button></form>}
          <section className="px-5 py-5">
            <h3 className="text-sm font-semibold text-foreground">{t("История изменений")}</h3>
            {override.history?.length ? (
              <div className="mt-3 space-y-3">
                {override.history.map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-border bg-card p-3.5">
                    <p className="text-[11px] font-medium text-muted-foreground">{entry.source} · {entry.timestamp}</p>
                    <blockquote className="mt-2 text-sm leading-5 text-foreground">«{entry.message}»</blockquote>
                    {entry.detectedChange && (
                      <div className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{t("Автоматически определено:")}<span className="min-w-0 break-words font-medium text-foreground">{entry.detectedChange.toLowerCase()}</span>
                      </div>
                    )}
                    <Button variant="outline" size="sm" className="mt-3 w-full" disabled={readOnly} onClick={onRevert}><RotateCcw />{t("Вернуть изменение")}</Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">{t("Изменений для этой пары ещё не было.")}</p>
            )}
          </section>
        </div>
      </aside>
    </div>
  )
}
