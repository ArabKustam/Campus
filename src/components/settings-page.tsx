import {useFeature} from '../lib/features'
import {t,useLanguage,LanguageSelect} from '../lib/language'
import {PlatonusConnect} from './platonus-connect'
import {ScopePicker,ScopeHelp,useGroupReadOnly} from './group-context'
import { CatalogSettings } from './catalog-settings'
import { UsageSettings } from './usage-settings'
import { requestApi } from '../lib/api-client'
import { AccountSecurity } from './account-security'
import { useEffect, useRef, useState } from 'react'
import {
  BookOpen,
  CalendarDays,
  GraduationCap,
  Send,
  Sparkles,
  Users,

  ChevronRight,
  Clock3,
  Globe2,
  HardDrive,
  LockKeyhole,
  Menu,
  Moon,
  Plus,
  Smartphone,
  Sun,
  X,
} from 'lucide-react'
import type { AppSettings, ThemeMode } from '../hooks/use-app-settings'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { SettingsPanel, SettingRow } from './settings-primitives'
import { PersonalSettings } from './personal-settings'
import { PeopleSettings } from './people-settings'


const fieldClass = 'h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-shadow focus:border-blue-300 focus:ring-2 focus:ring-blue-100'

type SettingsSection = 'platonus' | 'catalog' | 'usage' | 'general' | 'schedule' | 'telegram' | 'whatsapp' | 'automation' | 'storage' | 'security' | 'people'

const sections: Array<{ id: SettingsSection; label: string; icon: typeof Globe2 }> = [
  { id: 'general', label: 'Общие', icon: Globe2 },
  { id: 'platonus', label: 'Platonus', icon: GraduationCap },
  { id: 'catalog', label: 'Редактор занятий', icon: BookOpen },
  { id: 'usage', label: 'AI и лимиты', icon: Sparkles },
  { id: 'schedule', label: 'Мой учебный календарь', icon: CalendarDays },
  { id: 'telegram', label: 'Telegram', icon: Send },
  { id: 'whatsapp', label: 'WhatsApp', icon: Smartphone },
  { id: 'automation', label: 'Автоматизация', icon: Clock3 },
  { id: 'storage', label: 'Хранилище', icon: HardDrive },
  { id: 'people', label: 'Люди и роли', icon: Users },
  { id: 'security', label: 'Безопасность', icon: LockKeyhole },
]

type SettingsPageProps = {
  onMenuClick: () => void
  settings: AppSettings
  onUpdate: (patch: Partial<AppSettings>) => void
}

export function SettingsPage({ onMenuClick, settings, onUpdate }: SettingsPageProps) {
 useLanguage();
  const aiEnabled=useFeature('ai'),messengers=useFeature('messengers')
  const allowed=(id:string)=>id==='usage'?aiEnabled:['telegram','whatsapp','people','automation'].includes(id)?messengers:id!=='storage'
  const readOnly=useGroupReadOnly()
  const [section, setSection] = useState<SettingsSection>(()=>(allowed(sessionStorage.getItem('campus-settings-section')||'general')?sessionStorage.getItem('campus-settings-section') as SettingsSection:null)||'general')

  const navRef=useRef<HTMLDivElement>(null)
  useEffect(()=>{navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({block:'nearest',inline:'center'})},[section])
  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="-ml-2 shrink-0 md:hidden" onClick={onMenuClick} aria-label={t("Открыть меню")}><Menu /></Button>
        <h1 className="text-xl font-semibold tracking-[-0.03em] text-foreground sm:text-2xl">{t("Настройки")}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[190px_minmax(0,1fr)]">
        <nav aria-label={t("Разделы настроек")} className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
          <div ref={navRef} className="flex min-w-max gap-1 lg:block lg:min-w-0 lg:space-y-1">
            {sections.filter(s=>allowed(s.id)).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                aria-current={section === id ? "page" : undefined}
                onClick={() => {setSection(id);sessionStorage.setItem('campus-settings-section',id)}}
                className={cn(
                  'flex h-10 items-center gap-2.5 whitespace-nowrap rounded-md px-3 text-left text-sm font-medium transition-colors lg:h-9 lg:w-full lg:whitespace-normal lg:text-xs',
                  section === id ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="size-4 stroke-[1.75]" />
                <span className="flex-1">{t(label)}</span>
                <ChevronRight className="hidden size-3.5 lg:block" />
              </button>
            ))}
          </div>
        </nav>

        <div className="min-w-0 max-w-3xl">
          {section === 'catalog' && <div className="space-y-3"><ScopePicker purpose="Редактировать справочники для"/><ScopeHelp/>{readOnly?<p className="text-sm">Справочники этой группы редактирует староста.</p>:<CatalogSettings />}</div>}
          {section === 'platonus' && <PlatonusConnect/>}
          {section === 'usage' && <UsageSettings />}
          {section === 'general' && <GeneralSettings settings={settings} onUpdate={onUpdate} />}
          {section === 'schedule' && <ScheduleSettings settings={settings} onUpdate={onUpdate} />}
          {section === 'automation' && <AutomationSettings settings={settings} onUpdate={onUpdate} />}
          {section === 'people' && <PeopleSettings />}
          {section === 'telegram' && <PersonalSettings key="telegram" provider="telegram" />}
          {section === 'whatsapp' && <PersonalSettings key="whatsapp" provider="whatsapp" />}
          {section === 'storage' && <StorageSettings />}
          {section === 'security' && <AccountSecurity />}
        </div>
      </div>
    </main>
  )
}


function GeneralSettings({ settings, onUpdate }: Omit<SettingsPageProps, 'onMenuClick'>) {
 useLanguage();
  const themes: Array<{ id: ThemeMode; label: string; icon: typeof Sun }> = [
    { id: 'system', label: 'Системная', icon: Smartphone },
    { id: 'light', label: 'Светлая', icon: Sun },
    { id: 'dark', label: 'Тёмная', icon: Moon },
  ]

  return (
    <SettingsPanel title={t("Общие")} description={t("Основные параметры интерфейса и календаря.")}>
      <SettingRow label={t("Campus на телефоне")} description={t("Как добавить сайт на главный экран.")}><Button variant="outline" onClick={()=>window.dispatchEvent(new Event("campus-install-guide"))}>{t("Как установить")}</Button></SettingRow>
      <SettingRow label={t("Знакомство с сайтом")} description={t("Короткий тур по основным разделам.")}><Button variant="outline" onClick={()=>window.dispatchEvent(new Event("campus-start-tour"))}>{t("Показать тур")}</Button></SettingRow>
      <SettingRow label={t("Часовой пояс")} description={t("Используется для времени занятий и сообщений.")}>
        <select className={fieldClass} value={settings.timezone} onChange={(event) => onUpdate({ timezone: event.target.value })}>
          <option value="Asia/Almaty">{t("Алматы / Астана · UTC+5")}</option>
          <option value="Europe/Moscow">{t("Москва · UTC+3")}</option>
          <option value="UTC">UTC</option>
        </select>
      </SettingRow>
      <SettingRow label={t("Начало недели")}>
        <select className={fieldClass} value={settings.weekStartsOn} onChange={(event) => onUpdate({ weekStartsOn: event.target.value as AppSettings['weekStartsOn'] })}>
          <option value="monday">{t("Понедельник")}</option>
          <option value="sunday" disabled>{t("Воскресенье — недоступно")}</option>
        </select>
      </SettingRow>
      <SettingRow label={t("Язык интерфейса")}>
        <LanguageSelect/>
      </SettingRow>
      <SettingRow label={t("Тема")}>
        <div className="grid grid-cols-3 rounded-lg border border-border bg-muted/60 p-1">
          {themes.map(({ id, label, icon: Icon }) => (
            <button key={id} aria-label={t(label)} aria-pressed={settings.theme === id} onClick={() => onUpdate({ theme: id })} className={cn('flex min-h-10 flex-wrap items-center justify-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors', settings.theme === id ? 'bg-card text-foreground shadow-subtle' : 'text-muted-foreground hover:text-foreground')}>
              <Icon className="size-3.5" /><span>{t(label)}</span>
            </button>
          ))}
        </div>
      </SettingRow>
    </SettingsPanel>
  )
}

function ScheduleSettings({ settings, onUpdate }: Omit<SettingsPageProps, 'onMenuClick'>) {
 useLanguage();
  return (
    <div className="space-y-5">
      <SettingsPanel title={t("Личный учебный календарь")} description={t("Границы семестра и чередование недель вашего расписания.")}>
        <SettingRow label={t("Начало семестра")}><input type="date" className={fieldClass} value={settings.semesterStart} onChange={(event) => onUpdate({ semesterStart: event.target.value })} /></SettingRow>
        <SettingRow label={t("Конец семестра")}><input type="date" className={fieldClass} value={settings.semesterEnd} onChange={(event) => onUpdate({ semesterEnd: event.target.value })} /></SettingRow>
        <SettingRow label={t("Опорная неделя")} description={t("Дата внутри первой известной учебной недели.")}><input type="date" className={fieldClass} value={settings.anchorWeekDate} onChange={(event) => onUpdate({ anchorWeekDate: event.target.value })} /></SettingRow>
        <SettingRow label={t("Тип опорной недели")}>
          <select className={fieldClass} value={settings.anchorWeekType} onChange={(event) => onUpdate({ anchorWeekType: event.target.value as AppSettings['anchorWeekType'] })}><option value="odd">{t("Числитель")}</option><option value="even">{t("Знаменатель")}</option></select>
        </SettingRow>
      </SettingsPanel>

      <SettingsPanel title={t("Временная коррекция")} description="Исправляет тип недели только для выбранной недели, не меняя опорную дату.">
        <SettingRow label={t("Использовать коррекцию")}><Switch checked={settings.temporaryParityEnabled} onChange={(checked) => onUpdate({ temporaryParityEnabled: checked })} /></SettingRow>
        {settings.temporaryParityEnabled && (
          <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
            <label className="text-xs font-medium text-foreground">{t("Дата внутри недели")}<input type="date" className={`${fieldClass} mt-1.5`} value={settings.temporaryParityDate} onChange={(event) => onUpdate({ temporaryParityDate: event.target.value })} /></label>
            <label className="text-xs font-medium text-foreground">{t("Считать неделю")}<select className={`${fieldClass} mt-1.5`} value={settings.temporaryParityType} onChange={(event) => onUpdate({ temporaryParityType: event.target.value as AppSettings['temporaryParityType'] })}><option value="odd">{t("Числителем")}</option><option value="even">{t("Знаменателем")}</option></select></label>
          </div>
        )}
      </SettingsPanel>
    </div>
  )
}

function AutomationSettings({ settings, onUpdate }: Omit<SettingsPageProps, 'onMenuClick'>) {
 useLanguage();
  const updateAutoApply = (key: keyof AppSettings['autoApply'], value: boolean) => onUpdate({ autoApply: { ...settings.autoApply, [key]: value } })
  const addTime = () => {
    const candidates = ['12:00', '16:00', '22:00']
    const next = candidates.find((time) => !settings.processingTimes.includes(time)) ?? '00:00'
    onUpdate({ processingTimes: [...settings.processingTimes, next] })
  }

  const applyOptions: Array<{ key: keyof AppSettings['autoApply']; label: string }> = [
    { key: 'homework', label: 'Домашние задания' },
    { key: 'notes', label: 'Заметки' },
    { key: 'materials', label: 'Материалы' },
    { key: 'room', label: 'Изменение аудитории' },
    { key: 'online', label: 'Онлайн занятие' },
    { key: 'cancellation', label: 'Отмена занятия' },
    { key: 'move', label: 'Перенос занятия' },
    { key: 'time', label: 'Изменение времени' },
  ]

  return (
    <div className="space-y-5">
      <SettingsPanel title={t("Автоматизация")} description="Когда обрабатывать новые сообщения и какие изменения применять без проверки.">
        <SettingRow label="Автоматическая обработка сообщений"><Switch checked={settings.automationEnabled} onChange={(checked) => onUpdate({ automationEnabled: checked })} /></SettingRow>
        <div className={cn('px-5 py-4', !settings.automationEnabled && 'pointer-events-none opacity-50')}>
          <p className="mb-3 text-sm font-medium text-foreground">Режим</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <RadioCard checked={settings.automationMode === 'scheduled'} label="В определённое время" description="Запуск по заданному расписанию" onClick={() => onUpdate({ automationMode: 'scheduled' })} />
            <RadioCard checked={settings.automationMode === 'interval'} label="Каждые N часов" description="Равномерные интервалы в течение дня" onClick={() => onUpdate({ automationMode: 'interval' })} />
          </div>

          {settings.automationMode === 'scheduled' ? (
            <div className="mt-4">
              <div className="flex flex-wrap gap-2">
                {settings.processingTimes.map((time, index) => (
                  <div key={`${time}-${index}`} className="flex items-center rounded-md border border-border bg-card shadow-subtle">
                    <input aria-label={`Время обработки ${index + 1}`} type="time" value={time} onChange={(event) => onUpdate({ processingTimes: settings.processingTimes.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} className="h-9 w-[104px] bg-transparent px-3 text-sm font-medium tabular-nums text-foreground outline-none" />
                    <button aria-label={`Удалить время ${time}`} onClick={() => onUpdate({ processingTimes: settings.processingTimes.filter((_, itemIndex) => itemIndex !== index) })} className="grid h-9 w-8 place-items-center border-l border-border text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="mt-3" onClick={addTime}><Plus />Добавить время</Button>
            </div>
          ) : (
            <label className="mt-4 block max-w-[220px] text-xs font-medium text-foreground">Интервал, часов<input type="number" min="1" max="24" className={`${fieldClass} mt-1.5`} value={settings.intervalHours} onChange={(event) => onUpdate({ intervalHours: Number(event.target.value) })} /></label>
          )}
        </div>
      </SettingsPanel>

      <SettingsPanel title="Автоматически применять" description="Остальные типы изменений всегда будут отправляться на проверку.">
        <div className="grid gap-x-6 gap-y-1 px-5 py-3 sm:grid-cols-2">
          {applyOptions.map((option) => (
            <label key={option.key} className="flex min-h-10 cursor-pointer items-center gap-3 text-sm text-foreground">
              <input type="checkbox" checked={settings.autoApply[option.key]} onChange={(event) => updateAutoApply(option.key, event.target.checked)} className="size-4 rounded border-input accent-blue-600" />
              {option.label}
            </label>
          ))}
        </div>
        <SettingRow label="Минимальная уверенность" description="Автоприменение сработает при уверенности не ниже этого значения.">
          <div>
            <div className="mb-2 flex items-center justify-between text-xs"><span className="text-muted-foreground">Порог</span><span className="font-semibold tabular-nums text-foreground">{settings.minimumConfidence}%</span></div>
            <input aria-label="Минимальная уверенность" type="range" min="50" max="100" value={settings.minimumConfidence} onChange={(event) => onUpdate({ minimumConfidence: Number(event.target.value) })} className="h-1.5 w-full cursor-pointer accent-blue-600" />
          </div>
        </SettingRow>
      </SettingsPanel>

      <SettingsPanel title="Контекст" description="Количество соседних сообщений, учитываемых при обработке.">
        <SettingRow label="Предыдущие сообщения"><input type="number" min="0" max="10" className={fieldClass} value={settings.previousMessagesContext} onChange={(event) => onUpdate({ previousMessagesContext: Number(event.target.value) })} /></SettingRow>
        <SettingRow label="Следующие сообщения"><input type="number" min="0" max="10" className={fieldClass} value={settings.nextMessagesContext} onChange={(event) => onUpdate({ nextMessagesContext: Number(event.target.value) })} /></SettingRow>
      </SettingsPanel>

      <SettingsPanel title="Изображения" description="Что делать с изображениями из входящих сообщений.">
        <div className="grid gap-2 p-5">
          <RadioCard checked={settings.imageHandling === 'archive'} label="Архивировать" description="Сохранить изображение без автоматического анализа" onClick={() => onUpdate({ imageHandling: 'archive' })} />
          <RadioCard checked={settings.imageHandling === 'analyze'} label="Анализировать автоматически" description="Извлекать расписание, задания и материалы" onClick={() => onUpdate({ imageHandling: 'analyze' })} />
          <RadioCard checked={settings.imageHandling === 'ignore'} label="Игнорировать" description="Не сохранять и не обрабатывать изображения" onClick={() => onUpdate({ imageHandling: 'ignore' })} />
        </div>
      </SettingsPanel>
    </div>
  )
}


function StorageSettings() {
 useLanguage();
  const [stats,setStats] = useState<{messages:number;files:number;bytes:number} | null>(null)
  const [error,setError] = useState('')
  useEffect(() => { void requestApi<{messages:number;files:number;bytes:number}>('/api/storage').then(setStats).catch((e) => setError(e.message)) }, [])
  return <SettingsPanel title={t("Хранилище")} description="Данные вашего рабочего пространства.">{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<SettingRow label={t("Сообщения")}><p className="text-sm">{stats ? stats.messages : t("Загрузка…")}</p></SettingRow><SettingRow label={t("Вложения")}><p className="text-sm">{stats ? `${stats.files} файлов · ${(stats.bytes / 1024 / 1024).toFixed(1)} МБ` : t("Загрузка…")}</p></SettingRow><p className="text-sm text-muted-foreground">До 20 МБ на файл. Вложения доступны только после входа в ваш аккаунт.</p></SettingsPanel>
}

function Switch({ checked, onChange, ...props }: { checked: boolean; onChange: (checked: boolean) => void; 'aria-labelledby'?: string }) {
 useLanguage();
  return (
    <button {...props} role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="inline-flex h-11 w-11 shrink-0 items-center rounded-md">
      <span className={cn('relative block h-6 w-11 rounded-full transition-colors', checked ? 'bg-blue-600' : 'bg-slate-400')}>
        <span className={cn('absolute left-0 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </span>
    </button>
  )
}

function RadioCard({ checked, label, description, onClick }: { checked: boolean; label: string; description: string; onClick: () => void }) {
 useLanguage();
  return (
    <button aria-pressed={checked} onClick={onClick} className={cn('flex items-start gap-3 rounded-lg border p-3 text-left transition-colors', checked ? 'border-blue-200 bg-blue-50/70' : 'border-border bg-card hover:bg-muted/60')}>
      <span className={cn('mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border', checked ? 'border-blue-600' : 'border-slate-300')}>{checked && <span className="size-2 rounded-full bg-blue-600" />}</span>
      <span><span className="block text-xs font-medium text-foreground">{t(label)}</span><span className="mt-1 block text-[10px] leading-4 text-muted-foreground">{description}</span></span>
    </button>
  )
}
