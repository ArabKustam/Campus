import {t,useLanguage} from '../../lib/language'
import { Button } from './button'

export function LoadingState({ label = t("Загрузка…") }: { label?: string }) {
 useLanguage();
  return <div role="status" className="space-y-3 py-2"><span className="sr-only">{label}</span>{[0, 1, 2].map((item) => <div key={item} aria-hidden="true" className="rounded-lg border bg-card p-4"><div className="h-4 w-2/3 animate-pulse rounded bg-muted" /><div className="mt-3 h-3 w-1/3 animate-pulse rounded bg-muted" /></div>)}</div>
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
 useLanguage();
  return <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-card p-4 text-sm"><p className="min-w-0 flex-1 break-words text-destructive">{message}</p>{onRetry && <Button variant="outline" size="sm" onClick={onRetry}>{t("Повторить")}</Button>}</div>
}
export function EmptyState({ title, description }: { title: string; description?: string }) {
 useLanguage();
  return <div className="rounded-lg border bg-card px-5 py-12 text-center"><p className="text-sm font-medium">{title}</p>{description && <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>}</div>
}
