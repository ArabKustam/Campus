import {t,useLanguage} from '../lib/language'
import { CalendarPlus, ChevronLeft, ChevronRight, Menu, Search } from 'lucide-react'
import { Button } from './ui/button'

export function PageHeader({ onMenuClick }: { onMenuClick: () => void }) {
 useLanguage();
  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-background/95 backdrop-blur-sm">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuClick} aria-label={t("Открыть меню")}>
          <Menu />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-semibold tracking-[-0.025em] text-foreground">{t("Расписание")}</h1>
          <p className="hidden text-xs text-muted-foreground sm:block">Весенний семестр · 2026</p>
        </div>

        <Button variant="outline" size="icon" className="hidden sm:inline-flex" aria-label="Поиск">
          <Search />
        </Button>
        <div className="hidden items-center rounded-md border border-border bg-card p-0.5 shadow-subtle sm:flex">
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("Предыдущая неделя")}>
            <ChevronLeft />
          </Button>
          <button className="h-8 border-x border-border px-3 text-xs font-medium text-foreground">{t("Сегодня")}</button>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("Следующая неделя")}>
            <ChevronRight />
          </Button>
        </div>
        <Button size="default" className="h-9 w-9 shrink-0 px-0 sm:w-auto sm:px-3.5" aria-label="Добавить занятие">
          <CalendarPlus />
          <span className="hidden sm:inline">Добавить занятие</span>
        </Button>
      </div>
    </header>
  )
}
