import {t,useLanguage} from '../lib/language'
import { LoadingState, ErrorState } from './ui/page-state'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check,
  Menu,
  MessageCircleOff,
  Pencil,
  RotateCcw,
  ScanSearch,
} from 'lucide-react'
import {
  processingActionLabels,
  type ProcessingAction,
  type ProcessingCandidate,
  type ProcessingItemState,
  type ProcessingRun,
} from '../data/processing'
import { SCHEDULE_TEMPLATE, TIME_SLOTS } from '../data/schedule'
import { campusApi, type ProcessingResponse } from '../lib/campus-api'
import { mapProcessingAction, applyProcessingAction, revertProcessingAction } from '../lib/processing-api'
import { cn } from '../lib/utils'
import { Badge } from './ui/badge'
import { Button } from './ui/button'


const fieldClass = 'h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-shadow focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
const textAreaClass = 'min-h-[84px] w-full resize-y rounded-md border border-input bg-card px-3 py-2.5 text-sm leading-5 text-foreground outline-none transition-shadow focus:border-blue-300 focus:ring-2 focus:ring-blue-100'

type Tab = 'review' | 'applied' | 'ignored' | 'runs'

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'review', label: 'Требуют проверки' },
  { id: 'applied', label: 'Применённые' },
  { id: 'ignored', label: 'Игнорированные' },
  { id: 'runs', label: 'История запусков' },
]

const sourceStyles = {
  telegram: 'border-sky-200 bg-sky-50 text-sky-700',
  whatsapp: 'border-emerald-200 bg-emerald-50 text-emerald-700',
}

const subjectOptions = Array.from(new Set(
  Object.values(SCHEDULE_TEMPLATE).flatMap((week) => Object.values(week).flatMap((lessons) => lessons.map((lesson) => lesson.title))),
)).sort((a, b) => a.localeCompare(b, 'ru'))

const statusLabels: Record<Exclude<ProcessingItemState, 'review'>, string> = {
  applied: 'Применено',
  ignored: 'Игнорировано',
  undone: 'Изменение отменено',
}

type ProcessingPageProps = {
  onMenuClick: () => void
  onRefresh: () => Promise<void>
}

export function ProcessingPage({ onMenuClick, onRefresh }: ProcessingPageProps) {
 useLanguage();
  const [activeTab, setActiveTab] = useState<Tab>('review')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [items, setItems] = useState<ProcessingCandidate[]>([])
  const [runs, setRuns] = useState<ProcessingRun[]>([])
  const [statistics, setStatistics] = useState<ProcessingResponse['statistics']>({ awaitingAnalysis: 0, changesFound: 0, requiresReview: 0, processedToday: 0 })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadProcessing = useCallback(async () => {
    setLoading(true)
    try {
      setLoadError(null)
      const result = await campusApi.processing()
      setStatistics(result.statistics)
      setItems(result.actions.map(mapProcessingAction))
      setRuns(result.runs.map(mapRun))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Не удалось загрузить очередь обработки')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void loadProcessing() }, [loadProcessing])

  const updateItem = (id: string, patch: Partial<ProcessingCandidate>) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  const applyChange = async (item: ProcessingCandidate) => {
    setBusy(item.id)
    setLoadError(null)
    try {
      await applyProcessingAction(item, campusApi, onRefresh)
      setEditingId(null)
      await loadProcessing()
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Не удалось применить действие')
    } finally {
      setBusy(null)
    }
  }

  const undoChange = async (item: ProcessingCandidate) => {
    setBusy(item.id)
    try {
      await revertProcessingAction(item, campusApi, onRefresh)
      await loadProcessing()
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Не удалось отменить изменение')
    } finally {
      setBusy(null)
    }
  }

  const rejectChange = async (item: ProcessingCandidate) => {
    setBusy(item.id)
    try {
      await campusApi.rejectAction(item.id)
      await loadProcessing()
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Не удалось отклонить действие')
    } finally {
      setBusy(null)
    }
  }

  const runProcessing = async () => {
    setBusy('run')
    try {
      await campusApi.runProcessing()
      await loadProcessing()
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Не удалось запустить обработку')
    } finally {
      setBusy(null)
    }
  }

  const visibleItems = useMemo(() => {
    if (activeTab === 'review') return items.filter((item) => item.state === 'review')
    if (activeTab === 'applied') return items.filter((item) => item.state === 'applied' || item.state === 'undone')
    if (activeTab === 'ignored') return items.filter((item) => item.state === 'ignored')
    return []
  }, [activeTab, items])

  const reviewCount = items.filter((item) => item.state === 'review').length
  const stats = [
    { label: 'Ожидают анализа', value: String(statistics.awaitingAnalysis), unit: 'сообщения' },
    { label: 'Найдено изменений', value: String(statistics.changesFound), unit: 'изменения' },
    { label: 'Требуют проверки', value: String(statistics.requiresReview), unit: statistics.requiresReview === 1 ? 'сообщение' : 'сообщения' },
    { label: 'Обработано сегодня', value: String(statistics.processedToday), unit: statistics.processedToday === 1 ? 'действие' : 'действия' },
  ]

  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="-ml-2 shrink-0 md:hidden" onClick={onMenuClick} aria-label={t("Открыть меню")}><Menu /></Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-[-0.03em] text-foreground sm:text-2xl">Обработка</h1>
          <p className="mt-1 text-xs text-muted-foreground">Контроль автоматического разбора входящих сообщений</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void runProcessing()} disabled={busy !== null}><ScanSearch />Запустить</Button>
      </div>

      {loadError && <ErrorState message={loadError} onRetry={() => void loadProcessing()} />}
      {loading && <LoadingState label="Загрузка обработки" />}

      <section aria-label="Статистика обработки" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-card p-4 shadow-subtle">
            <p className="text-[11px] font-medium text-muted-foreground">{stat.label}</p>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-xl font-semibold tracking-[-0.03em] text-foreground">{stat.value}</span>
              <span className="text-[10px] text-muted-foreground">{stat.unit}</span>
            </div>
          </div>
        ))}
      </section>

      <div className="mb-5 overflow-x-auto pb-1">
        <div className="inline-flex min-w-max rounded-lg border border-border bg-card p-1 shadow-subtle" role="group" aria-label="Разделы обработки">
          {tabs.map((tab) => (
            <button key={tab.id}  aria-pressed={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className={cn('h-8 rounded-md px-3 text-xs font-medium transition-colors', activeTab === tab.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {tab.label}
              {tab.id === 'review' && reviewCount > 0 && <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">{reviewCount}</span>}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'runs' ? (
        <section aria-label="История запусков" className="overflow-hidden rounded-lg border border-border bg-card shadow-subtle">
          <div className="border-b border-border px-4 py-3.5 sm:px-5"><h2 className="text-sm font-semibold text-foreground">История запусков</h2></div>
          <div className="divide-y divide-border">
            {!loading && !loadError && runs.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted-foreground">Обработка ещё не запускалась.</p>}
            {runs.map((run) => (
              <div key={run.id} className="grid gap-3 px-4 py-4 text-xs xl:grid-cols-[minmax(0,1fr)_110px_110px_110px_80px] sm:items-center sm:px-5">
                <div><p className="font-medium text-foreground">{run.source}</p><p className="mt-1 text-[10px] text-muted-foreground">{run.startedAt}</p></div>
                <p><span className="text-muted-foreground">Сообщений:</span> <span className="font-medium text-foreground">{run.messages}</span></p>
                <p><span className="text-muted-foreground">Изменений:</span> <span className="font-medium text-foreground">{run.changes}</span></p>
                <p><span className="text-muted-foreground">Проверка:</span> <span className="font-medium text-foreground">{run.review}</span></p>
                <div className="text-right"><Badge className={run.status === 'completed' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}>{run.duration}</Badge></div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section aria-label={tabs.find((tab) => tab.id === activeTab)?.label}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">{tabs.find((tab) => tab.id === activeTab)?.label}</h2>
            <p className="text-[11px] text-muted-foreground">{visibleItems.length} записей</p>
          </div>
          <div className="space-y-3">
            {visibleItems.map((item) => (
              <article key={item.id} className="overflow-hidden rounded-lg border border-border bg-card shadow-subtle">
                <header className="flex items-center gap-3 border-b border-border/80 px-4 py-3 sm:px-5">
                  <Badge className={sourceStyles[item.source]}>{item.source === 'telegram' ? 'Telegram' : 'WhatsApp'}</Badge>
                  <span className="flex-1 text-[11px] text-muted-foreground">{item.receivedAt}</span>
                  {item.state !== 'review' && <Badge>{statusLabels[item.state]}</Badge>}
                </header>

                <div className="px-4 py-4 sm:px-5">
                  <blockquote className="text-sm leading-6 text-foreground">«{item.message}»</blockquote>
                </div>

                <section className="border-t border-border bg-muted/55 px-4 py-4 sm:px-5" aria-label="Предположение системы">
                  {editingId === item.id ? (
                    <EditCandidate item={item} onChange={(patch) => updateItem(item.id, patch)} onCancel={() => setEditingId(null)} onApply={() => applyChange(item)} />
                  ) : (
                    <>
                      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="grid size-7 place-items-center rounded-md border border-border bg-card text-slate-600"><ScanSearch className="size-3.5" /></span>
                            <div><p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Предположение системы</p><p className="mt-0.5 text-sm font-semibold text-foreground">{processingActionLabels[item.action]}</p></div>
                          </div>
                          <div className="mt-4 grid gap-2 text-xs sm:grid-cols-[minmax(0,1fr)_110px_100px]">
                            <p className="font-medium leading-5 text-foreground">{item.subject}</p>
                            <p className="text-foreground">{item.lessonDate ? new Date(`${item.lessonDate}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : 'Дата не указана'}</p>
                            <p className="tabular-nums text-foreground">{item.payload.newTimeStart || TIME_SLOTS[item.slot - 1]?.start || 'Время не указано'}{(item.payload.newTimeEnd || TIME_SLOTS[item.slot - 1]?.end) ? `–${item.payload.newTimeEnd || TIME_SLOTS[item.slot - 1]?.end}` : ''}</p>
                          </div>
                        </div>
                        <div className="sm:text-right">
                          <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Уверенность</p>
                          <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{item.confidence}%</p>
                          <div className="mt-2 h-1 overflow-hidden rounded-full bg-border sm:ml-auto sm:w-24"><div className={cn('h-full rounded-full', item.confidence >= 85 ? 'bg-emerald-500' : item.confidence >= 60 ? 'bg-amber-500' : 'bg-slate-400')} style={{ width: `${item.confidence}%` }} /></div>
                        </div>
                      </div>

                      {item.validationStatus !== 'valid' && (
                        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          <p className="font-medium">Действие требует уточнения</p>
                          {item.validationErrors.length > 0 && <ul className="mt-1 list-disc pl-4">{item.validationErrors.map((error) => <li key={error}>{error}</li>)}</ul>}
                        </div>
                      )}

                      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                        {item.state === 'review' && <Button size="sm" disabled={busy === item.id || item.validationStatus !== 'valid'} onClick={() => void applyChange(item)}><Check />Применить</Button>}
                        {item.state === 'review' && <Button variant="outline" size="sm" onClick={() => setEditingId(item.id)}><Pencil />{t("Изменить")}</Button>}
                        {item.state === 'review' && <Button variant="ghost" size="sm" disabled={busy === item.id} className="text-muted-foreground" onClick={() => void rejectChange(item)}><MessageCircleOff />Игнорировать</Button>}
                        {item.state === 'applied' && <Button variant="outline" size="sm" disabled={busy === item.id} onClick={() => void undoChange(item)}><RotateCcw />Отменить изменение</Button>}
                      </div>
                    </>
                  )}
                </section>
              </article>
            ))}
          </div>

          {!loading && !loadError && visibleItems.length === 0 && (
            <div className="grid min-h-52 place-items-center rounded-lg border border-dashed border-border bg-card px-6 text-center">
              <div><Check className="mx-auto size-5 text-muted-foreground" /><p className="mt-3 text-sm font-medium text-foreground">В этом разделе записей нет</p></div>
            </div>
          )}
        </section>
      )}
    </main>
  )
}

function EditCandidate({ item, onChange, onCancel, onApply }: { item: ProcessingCandidate; onChange: (patch: Partial<ProcessingCandidate>) => void; onCancel: () => void; onApply: () => void }) {
 useLanguage();
  return (
    <div>
      <div className="mb-4 flex items-center gap-2"><Pencil className="size-4 text-muted-foreground" /><h3 className="text-sm font-semibold text-foreground">Изменить предположение</h3></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-foreground">Действие
          <select className={`${fieldClass} mt-1.5`} value={item.action} onChange={(event) => onChange({ action: event.target.value as ProcessingAction })}>
            {Object.entries(processingActionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-foreground">{t("Предмет")}<select className={`${fieldClass} mt-1.5`} value={item.subject} onChange={(event) => onChange({ subject: event.target.value })}>
            {subjectOptions.map((subject) => <option key={subject}>{subject}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-foreground">{t("Дата")}<input type="date" className={`${fieldClass} mt-1.5`} value={item.lessonDate} onChange={(event) => onChange({ lessonDate: event.target.value, linkedInstanceId: `${event.target.value}:${item.slot}` })} />
        </label>
        {item.action !== 'ADD_LESSON' && <label className="text-xs font-medium text-foreground">{t("Занятие")}<select className={`${fieldClass} mt-1.5`} value={item.slot} onChange={(event) => onChange({ slot: Number(event.target.value), linkedInstanceId: `${item.lessonDate}:${event.target.value}` })}>
            {TIME_SLOTS.map((slot) => <option key={slot.number} value={slot.number}>{slot.number} пара · {slot.start}–{slot.end}</option>)}
          </select>
        </label>
        }
        {item.action === 'ADD_LESSON' && <>
          <label className="text-xs font-medium">{t("Начало")}<input type="time" className={`${fieldClass} mt-1.5`} value={item.payload.newTimeStart ?? ''} onChange={(event) => onChange({ payload: { ...item.payload, newTimeStart: event.target.value || null } })} /></label>
          <label className="text-xs font-medium">{t("Окончание")}<input type="time" className={`${fieldClass} mt-1.5`} value={item.payload.newTimeEnd ?? ''} onChange={(event) => onChange({ payload: { ...item.payload, newTimeEnd: event.target.value || null } })} /></label>
          <label className="text-xs font-medium">{t("Кабинет")}<input className={`${fieldClass} mt-1.5`} value={item.payload.room ?? ''} onChange={(event) => onChange({ payload: { ...item.payload, room: event.target.value || null } })} /></label>
        </>}
        <label className="text-xs font-medium text-foreground sm:col-span-2">Текст
          <textarea className={`${textAreaClass} mt-1.5`} value={item.extractedText} onChange={(event) => onChange({ extractedText: event.target.value })} />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
        <Button size="sm" onClick={onApply}><Check />Сохранить и применить</Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>{t("Отмена")}</Button>
      </div>
    </div>
  )
}

function mapRun(run: ProcessingResponse['runs'][number]): ProcessingRun {
  const startedAt = run.startedAt || run.createdAt
  const durationSeconds = run.completedAt ? Math.max(0, Math.round((Date.parse(run.completedAt) - Date.parse(startedAt)) / 1000)) : null
  return {
    id: run.id,
    startedAt: new Date(startedAt).toLocaleString('ru-RU'),
    source: run.triggerType === 'cron' ? 'Cron Trigger' : 'Ручной запуск',
    messages: run.messagesScanned,
    changes: run.actionsCreated,
    review: run.actionsCreated,
    duration: durationSeconds === null ? run.status : `${durationSeconds} сек`,
    status: run.status === 'completed' ? 'completed' : 'partial',
  }
}
