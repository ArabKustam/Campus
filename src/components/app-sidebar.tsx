import {SupportButtons} from './notification-center'
import {t,useLanguage,LanguageSelect} from '../lib/language'
import {useFeature} from '../lib/features'
import { useAccount } from './auth-gate'
import { useRef, useState } from 'react'
import { useDialogFocus } from '../hooks/use-dialog-focus'
import {
  CalendarDays,
  CheckSquare2,
  ChevronRight,
  FileText,
  Inbox,
  MessageSquare,
  Settings,
  X,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { Button } from './ui/button'

const navigation = [
  { id: 'schedule', label: 'Расписание', icon: CalendarDays },
  { id: 'library', label: 'УМКД', icon: FileText },
  { id: 'grades', label: 'Оценки', icon: CheckSquare2 },
  { id: 'assistant', label: 'AI-помощник', icon: MessageSquare },
  {id:'tasks',label:'Задания',icon:CheckSquare2},
  {id:'materials',label:'Материалы',icon:FileText},
  { id: 'group', label: 'Моя группа', icon: Inbox },
]
export type AppPage = 'group' | 'library' | 'grades' | 'platonus' | 'people' | 'history' | 'assistant' | 'schedule' | 'tasks' | 'materials' | 'messages' | 'processing' | 'settings' | 'admin'

type AppSidebarProps = {
  onNotifications:()=>void
  onSupport:()=>void
  unread:number
  updatesNew:boolean
  mobile?: boolean
  open?: boolean
  onClose?: () => void
  activePage: AppPage
  onNavigate: (page: AppPage) => void
}

export function AppSidebar({ onNotifications, onSupport, unread, updatesNew, mobile = false, open = false, onClose, activePage, onNavigate }: AppSidebarProps) {
 useLanguage();
  const account = useAccount(),groupsEnabled=useFeature('groups'),aiEnabled=useFeature('ai'),tasksEnabled=useFeature('tasks')
  const [pinned,setPinned]=useState(()=>localStorage.getItem('campus-sidebar-pinned')==='1')
  const panel = useRef<HTMLElement>(null)
  useDialogFocus(panel, mobile && open, onClose)
  if (mobile && !open) return null
  return (
    <>
      {mobile && open && (
        <button
          data-dialog-backdrop tabIndex={-1} aria-label={t("Закрыть меню")}
          className="fixed inset-0 z-40 bg-slate-950/20 md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        ref={panel}
        data-pinned={pinned}
        data-desktop={!mobile}
        role={mobile ? "dialog" : undefined}
        aria-modal={mobile ? true : undefined}
        aria-label={mobile ? t("Навигация") : undefined}
        className={cn(
          'flex h-dvh w-[230px] max-w-[85vw] overflow-y-auto flex-col border-r border-border bg-background px-3 py-4',
          mobile
            ? 'fixed inset-y-0 left-0 z-50 transition-transform duration-200 md:hidden'
            : 'campus-sidebar fixed inset-y-0 left-0 z-30 hidden md:flex',
          mobile && (open ? 'translate-x-0' : '-translate-x-full'),
        )}
      >
        <div className="mb-7 flex h-9 items-center justify-between px-2">
          <div className="flex items-center gap-2.5">
            <img src="/campus.svg" alt="" className="size-7 shrink-0"/>
            <span className="sidebar-label text-[15px] font-semibold tracking-[-0.02em] text-foreground">Campus</span>
          </div>
          {mobile && (
            <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("Закрыть меню")}>
              <X />
            </Button>
          )}
        </div>

        {!mobile&&<button aria-label={pinned?t("Свернуть панель"):t("Закрепить панель")} title={pinned?t("Свернуть панель"):t("Закрепить панель")} className="mb-3 flex h-8 shrink-0 items-center gap-2 px-2 text-left text-xs text-muted-foreground" onClick={()=>setPinned(v=>{localStorage.setItem('campus-sidebar-pinned',v?'0':'1');return !v})}><ChevronRight className="size-4 shrink-0"/><span className="sidebar-label">{pinned?t("Свернуть панель"):t("Закрепить панель")}</span></button>}
        <nav aria-label={t("Основная навигация")} className="space-y-1">
          {navigation.filter(item=>(groupsEnabled||item.id!=='group')&&(aiEnabled||item.id!=='assistant')&&(tasksEnabled||!['tasks','materials'].includes(item.id))).map(({ id, label, icon: Icon }) => {
            const active = activePage === id
            return (
            <button
              key={t(label)}
              title={t(label)}
              aria-label={t(label)}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                onNavigate(id as AppPage)
                onClose?.()
              }}
              className={cn(
                'group flex min-h-11 w-full items-center gap-3 rounded-md px-2.5 text-left text-[13px] font-medium transition-colors',
                active
                  ? 'bg-blue-50/80 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className={cn('size-[17px] shrink-0 stroke-[1.75]', active && 'text-blue-600')} />
              <span className="sidebar-label flex-1">{t(label)}</span>

            </button>
            )
          })}
        </nav>

        <div className="mt-auto space-y-1"><SupportButtons onNotifications={onNotifications} onSupport={onSupport} unread={unread} updatesNew={updatesNew}/><LanguageSelect sidebar/>
          <button
            aria-label={t("Настройки")} title={t("Настройки")}
            aria-current={activePage === 'settings' ? 'page' : undefined}
            onClick={() => { onNavigate('settings'); onClose?.() }}
            className={cn(
              'group flex min-h-11 w-full items-center gap-3 rounded-md px-2.5 text-[13px] font-medium transition-colors',
              activePage === 'settings' ? 'bg-blue-50/80 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Settings className="size-[17px] stroke-[1.75]" />
            <span className="sidebar-label flex-1 text-left">{t("Настройки")}</span>
            <ChevronRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
          </button>
          <div className="flex items-center gap-2.5 border-t border-border px-2 pt-3">
            <div className="grid size-7 place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">{account?.user.displayName.slice(0, 2).toUpperCase() ?? 'C'}</div>
            <div className="sidebar-label min-w-0">
              <p className="truncate text-xs font-medium text-foreground">{account?.user.displayName ?? 'Campus'}</p>
              <p className="truncate text-[10px] text-muted-foreground">{account?.user.login ?? ''}</p>
            </div>
          </div>
          <button onClick={() => void account.logout().catch(() => window.location.reload())} className="sidebar-label w-full rounded-md px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted">{t("Выйти из аккаунта")}</button>
        </div>
      </aside>
    </>
  )
}
