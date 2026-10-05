import {t,useLanguage} from '../lib/language'
import { LoadingState, ErrorState } from './ui/page-state'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowUpRight,

  Check,
  Clock3,
  FileText,
  Image as ImageIcon,
  Menu,
  MessageCircleOff,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  Send,
} from 'lucide-react'
import { type InboxMessage, type MessageSource, type MessageState } from '../data/messages'
import type { LessonInstance, LessonOverride, LessonOverrideMap } from '../data/schedule'
import { campusApi, type MessageRecord } from '../lib/campus-api'
import { fromDateKey, getLessonsForDate } from '../lib/schedule-date'
import { cn } from '../lib/utils'
import { LessonDrawer } from './lesson-drawer'
import { Badge } from './ui/badge'
import { Button } from './ui/button'

type Filter = 'all' | MessageSource | 'unprocessed' | 'processed'

const filters: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'unprocessed', label: 'Не обработано' },
  { id: 'processed', label: 'Обработано' },
]

const sourceStyles: Record<MessageSource, string> = {
  telegram: 'border-sky-200 bg-sky-50 text-sky-700',
  whatsapp: 'border-emerald-200 bg-emerald-50 text-emerald-700',
}

const sourceNames: Record<MessageSource, string> = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
}

const resultState: Record<MessageState, { label: string; className: string }> = {
  applied: { label: 'Применено', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  review: { label: 'Требует проверки', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  unprocessed: { label: 'Не обработано', className: 'border-border bg-muted text-muted-foreground' },
  ignored: { label: 'Игнорировано', className: 'border-border bg-muted text-muted-foreground' },
  undone: { label: 'Действие отменено', className: 'border-border bg-muted text-muted-foreground' },
  reanalyzing: { label: 'Повторный анализ', className: 'border-blue-200 bg-blue-50 text-blue-700' },
}

type MessagesPageProps = {
  onMenuClick: () => void
  overrides: LessonOverrideMap
  onUpdateOverride: (instanceId: string, patch: Partial<LessonOverride>) => unknown
  onRevertOverride: (instanceId: string) => void
}

export function MessagesPage({ onMenuClick, overrides, onUpdateOverride, onRevertOverride }: MessagesPageProps) {
 useLanguage();
  const [activeFilter, setActiveFilter] = useState<Filter>('all')
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [openedLesson, setOpenedLesson] = useState<{ lesson: LessonInstance; date: Date } | null>(null)

  const loadMessages = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const result = await campusApi.messages()
      setMessages(result.map(mapMessage))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Не удалось загрузить сообщения')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadMessages() }, [loadMessages])

  const visibleMessages = useMemo(() => messages.filter((message) => {
    if (activeFilter === 'all') return true
    if (activeFilter === 'telegram' || activeFilter === 'whatsapp') return message.source === activeFilter
    if (activeFilter === 'unprocessed') return !message.result || message.result.state === 'unprocessed'
    return Boolean(message.result && message.result.state !== 'unprocessed')
  }), [activeFilter, messages])


  const updateMessageState = (id: string, state: MessageState) => {
    setMessages((current) => current.map((message) => message.id === id
      ? { ...message, result: message.result ? { ...message.result, state } : { recognizedAs: 'Не определено', state } }
      : message))
  }

  const openLinkedLesson = (message: InboxMessage) => {
    const instanceId = message.result?.linkedInstanceId
    if (!instanceId) return
    const [dateKey, slotValue] = instanceId.split(':')
    const date = fromDateKey(dateKey)
    const lesson = getLessonsForDate(date, overrides).find((item) => item.slot === Number(slotValue))
    if (lesson) setOpenedLesson({ lesson, date })
  }

  const undoAction = (message: InboxMessage) => {
    updateMessageState(message.id, 'undone')
    const instanceId = message.result?.linkedInstanceId
    if (!instanceId) return
    if (message.result?.recognizedAs === 'Домашнее задание') onUpdateOverride(instanceId, { homework: '' })
    if (message.result?.recognizedAs === 'Отмена занятия') onUpdateOverride(instanceId, { status: 'normal' })
    if (message.result?.recognizedAs === 'Материал занятия') onUpdateOverride(instanceId, { materials: [] })
  }

  const repeatAnalysis = (message: InboxMessage) => {
    updateMessageState(message.id, 'reanalyzing')
    window.setTimeout(() => updateMessageState(message.id, 'review'), 800)
  }

  const selectedLesson = openedLesson
    ? getLessonsForDate(openedLesson.date, overrides).find((lesson) => lesson.instanceId === openedLesson.lesson.instanceId)
    : undefined

  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="-ml-2 shrink-0 md:hidden" onClick={onMenuClick} aria-label={t("Открыть меню")}><Menu /></Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-[-0.03em] text-foreground sm:text-2xl">{t("Сообщения")}</h1>
          <p className="mt-1 text-xs text-muted-foreground">Журнал входящих сообщений из подключённых источников</p>
        </div>
        <Button variant="outline" size="sm" aria-label="Обновить сообщения" onClick={() => void loadMessages()} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : undefined} />{t("Обновить")}</Button>
      </div>

      <div className="mb-5 overflow-x-auto pb-1">
        <div className="inline-flex min-w-max rounded-lg border border-border bg-card p-1 shadow-subtle" role="group" aria-label="Фильтры сообщений">
          {filters.map((filter) => (
            <button
              key={filter.id}
              
              aria-pressed={activeFilter === filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={cn('h-8 rounded-md px-3 text-xs font-medium transition-colors', activeFilter === filter.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{visibleMessages.length} сообщений</p>
        <p className="hidden text-[11px] text-muted-foreground sm:block">Новые сообщения появляются сверху</p>
      </div>

      <section aria-label="Журнал входящих сообщений" className="space-y-3">
        {loadError && <ErrorState message={loadError} onRetry={() => void loadMessages()} />}
        {loading && <LoadingState label="Загрузка сообщений" />}
        {visibleMessages.map((message) => {
          const state = message.result?.state ?? 'unprocessed'
          return (
            <article key={message.id} className="overflow-hidden rounded-lg border border-border bg-card shadow-subtle">
              <header className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-border/80 px-4 py-3.5 sm:px-5">
                <Badge className={sourceStyles[message.source]}>{sourceNames[message.source]}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{message.groupName}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{message.sender}</p>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
                  <Clock3 className="size-3.5" />{message.date} · {message.time}
                </div>
              </header>

              <div className="px-4 py-4 sm:px-5">
                {message.replyContext && (
                  <div className="mb-3 rounded-md border border-border bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
                    <span className="font-medium text-foreground">В ответ на:</span> {message.replyContext}
                  </div>
                )}
                <p className="max-w-3xl text-sm leading-6 text-foreground">{message.text}</p>

                {message.attachments?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {message.attachments.map((attachment) => attachment.kind === 'image' ? (
                      <div key={attachment.name} className="w-full max-w-sm overflow-hidden rounded-lg border border-border bg-muted">
                        {attachment.previewUrl ? (
                          <img src={attachment.previewUrl} alt={attachment.name} className="aspect-[16/7] w-full object-cover" />
                        ) : (
                          <div className="grid aspect-[16/7] w-full place-items-center bg-card text-muted-foreground"><ImageIcon className="size-5" /></div>
                        )}
                        <div className="px-3 py-2.5"><p className="truncate text-xs font-medium text-foreground">{attachment.name}</p><p className="mt-1 text-[10px] text-muted-foreground">{attachment.meta}</p></div>
                      </div>
                    ) : (
                      <div key={attachment.name} className="flex max-w-sm items-center gap-3 rounded-lg border border-border bg-muted px-3 py-2.5">
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0"><p className="truncate text-xs font-medium text-foreground">{attachment.name}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{attachment.meta}</p></div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {message.result && (
                <section className="border-t border-border bg-muted/55 px-4 py-4 sm:px-5" aria-label="Результат обработки">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="grid size-7 place-items-center rounded-md border border-border bg-card text-slate-600"><ScanSearch className="size-3.5" /></span>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Распознано</p>
                        <p className="mt-0.5 text-sm font-semibold text-foreground">{message.result.recognizedAs}</p>
                      </div>
                    </div>
                    <Badge className={resultState[state].className}>
                      {state === 'reanalyzing' && <RefreshCw className="mr-1 size-3" />}{resultState[state].label}
                    </Badge>
                  </div>

                  {(message.result.subject || message.result.lessonDate || message.result.extractedText) && (
                    <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)]">
                      {message.result.subject && <div><dt className="text-muted-foreground">{t("Предмет")}</dt><dd className="mt-1 font-medium leading-5 text-foreground">{message.result.subject}</dd></div>}
                      {message.result.lessonDate && <div><dt className="text-muted-foreground">{t("Дата")}</dt><dd className="mt-1 font-medium text-foreground">{message.result.lessonDate}</dd></div>}
                      {message.result.extractedText && <div><dt className="text-muted-foreground">Текст</dt><dd className="mt-1 font-medium leading-5 text-foreground">{message.result.extractedText}</dd></div>}
                    </dl>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                    {message.result.linkedInstanceId && (
                      <Button variant="outline" size="sm" onClick={() => openLinkedLesson(message)}><ArrowUpRight />Открыть занятие</Button>
                    )}
                    {state === 'applied' && (
                      <Button variant="outline" size="sm" onClick={() => undoAction(message)}><RotateCcw />{t("Отменить действие")}</Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => repeatAnalysis(message)} disabled={state === 'reanalyzing'}><Send />Повторный анализ</Button>
                    {state !== 'ignored' && (
                      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => updateMessageState(message.id, 'ignored')}><MessageCircleOff />Игнорировать</Button>
                    )}
                  </div>
                </section>
              )}
            </article>
          )
        })}
      </section>

      {!loading && !loadError && visibleMessages.length === 0 && (
        <div className="grid min-h-56 place-items-center rounded-lg border border-dashed border-border bg-card px-6 text-center">
          <div><Check className="mx-auto size-5 text-muted-foreground" /><p className="mt-3 text-sm font-medium text-foreground">Сообщений в этом фильтре нет</p></div>
        </div>
      )}

      {selectedLesson && openedLesson && (
        <LessonDrawer
          lesson={selectedLesson}
          date={openedLesson.date}
          onClose={() => setOpenedLesson(null)}
          onUpdate={(patch) => onUpdateOverride(selectedLesson.instanceId, patch)}
          onRevert={() => onRevertOverride(selectedLesson.instanceId)}
        />
      )}
    </main>
  )
}

function mapMessage(message: MessageRecord): InboxMessage {
  const sentAt = new Date(message.sentAt)
  return {
    id: message.id,
    source: message.provider,
    groupName: message.chatName || message.sourceName || 'Учебная группа',
    sender: message.sender.name || message.sender.username || 'Неизвестный отправитель',
    date: sentAt.toLocaleDateString('ru-RU'),
    time: sentAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    text: message.text || 'Вложение без подписи',
    replyContext: message.replyTo?.text,
    attachments: message.attachments.map((attachment) => ({
      kind: attachment.contentType.startsWith('image/') ? 'image' : 'file',
      name: attachment.fileName,
      meta: `${attachment.contentType} · ${Math.max(1, Math.round(attachment.byteSize / 1024))} КБ`,
      previewUrl: attachment.contentType.startsWith('image/') ? campusApi.attachmentUrl(attachment.id) : undefined,
    })),
  }
}
