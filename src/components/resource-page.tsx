import {TaskWorkspace} from './task-workspace'
import {t,useLanguage} from '../lib/language'
import { useCallback, useEffect, useState } from 'react'
import { Menu, RefreshCw, ExternalLink } from 'lucide-react'
import { requestApi } from '../lib/api-client'
import { formatDueDate, type AttachmentInfo } from '../lib/campus-api'
import { AttachmentList } from './lesson-files'
import { Button } from './ui/button'
import { EmptyState, ErrorState, LoadingState } from './ui/page-state'

type Resource = { id: string; title: string; subjectName?: string; description?: string; dueAt?: string; status?: string; url?: string; createdAt: string; attachments?: AttachmentInfo[] }
function ResourceList({ kind, onMenuClick }: { kind: 'tasks' | 'materials'; onMenuClick: () => void }) {
 useLanguage();
  const [items, setItems] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const load = useCallback(async (cursor?: string) => {
    setLoading(true); setError(null)
    try {
      const data = await requestApi<Resource[]>(`/api/${kind === 'tasks' ? 'homework' : 'materials'}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
      setItems((current) => cursor ? [...current, ...data] : data)
      setMore(data.length === 100)
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("Не удалось загрузить данные")) }
    finally { setLoading(false) }
  }, [kind])
  useEffect(() => { void load() }, [load])
  const title = kind === 'tasks' ? t("Задания") : t("Материалы")
  return <main className="mx-auto w-full max-w-[1180px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
    <header className="mb-6 flex items-start gap-3"><Button variant="ghost" size="icon" className="-ml-2 shrink-0 md:hidden" onClick={onMenuClick} aria-label={t("Открыть меню")}><Menu /></Button><div className="min-w-0 flex-1"><h1 className="text-xl font-semibold sm:text-2xl">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{kind === 'tasks' ? t("Все задания с предметом и сроком сдачи") : t("Литература, документы и ссылки по предметам")}</p></div><Button variant="outline" size="icon" onClick={() => void load()} disabled={loading} aria-label={t("Обновить")} className="shrink-0"><RefreshCw className={loading?'animate-spin':undefined} /></Button></header>
    {error && <ErrorState message={error} onRetry={() => void load()} />}
    {loading && !items.length ? <LoadingState /> : !error && !items.length ? <EmptyState title={kind === 'tasks' ? t("Заданий пока нет") : t("Материалов пока нет")} description={t("Здесь появятся записи, добавленные из университетских сообщений.")} /> : <div className="space-y-3">{items.map((item) => <article key={item.id} className="rounded-lg border bg-card p-4 sm:p-5"><p className="text-xs text-muted-foreground">{item.subjectName || t("Предмет не указан")}</p><h2 className="mt-1 text-sm font-semibold">{item.title}</h2>{item.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.description}</p>}{item.attachments?.length ? <AttachmentList files={item.attachments} /> : null}{item.dueAt && <p className="mt-3 text-xs">{t("Срок:")} {formatDueDate(item.dueAt, { day: 'numeric', month: 'numeric', year: 'numeric' })}</p>}{kind==='tasks'&&<Button variant="outline" className="mt-3" onClick={()=>void requestApi(`/api/homework/${item.id}`,{method:'PATCH',body:JSON.stringify({status:item.status==='done'?'open':'done'})}).then(()=>load()).catch(e=>setError(e.message))}>{item.status==='done'?t("Вернуть к выполнению"):t("Отметить выполненным")}</Button>}{item.status && <p className="mt-2 text-xs text-muted-foreground">{item.status === 'done' ? t("Выполнено") : item.status === 'in_progress' ? t("В работе") : t("К выполнению")}</p>}{item.url && /^https?:\/\//i.test(item.url) && <a href={item.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm text-primary underline underline-offset-4">{t("Открыть материал")}<ExternalLink className="size-4" /><span className="sr-only">{t("в новой вкладке")}</span></a>}</article>)}</div>}
    {more && <Button className="mt-4" variant="outline" disabled={loading} onClick={() => void load(items.at(-1)?.createdAt)}>{loading ? t("Загрузка…") : t("Показать ещё")}</Button>}
  </main>
}

export function ResourcePage(props:{kind:'tasks'|'materials';onMenuClick:()=>void}){return props.kind==='tasks'?<TaskWorkspace onMenuClick={props.onMenuClick}/>:<ResourceList {...props}/>}
