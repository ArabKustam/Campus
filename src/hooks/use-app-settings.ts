import { useCallback, useEffect, useRef, useState } from 'react'
import { campusApi } from '../lib/campus-api'
import { hydrateAppSettings, toAutomationSetting } from '../lib/app-settings-mapper'

export type ThemeMode = 'system' | 'light' | 'dark'
export type AutomationMode = 'scheduled' | 'interval'
export type ImageHandlingMode = 'archive' | 'analyze' | 'ignore'

export type AppSettings = {
  timezone: string
  weekStartsOn: 'monday' | 'sunday'
  language: 'ru' | 'en'
  theme: ThemeMode
  semesterStart: string
  semesterEnd: string
  anchorWeekDate: string
  anchorWeekType: 'odd' | 'even'
  temporaryParityEnabled: boolean
  temporaryParityDate: string
  temporaryParityType: 'odd' | 'even'
  automationEnabled: boolean
  automationMode: AutomationMode
  processingTimes: string[]
  intervalHours: number
  autoApply: {
    homework: boolean
    notes: boolean
    materials: boolean
    room: boolean
    online: boolean
    cancellation: boolean
    move: boolean
    time: boolean
  }
  minimumConfidence: number
  previousMessagesContext: number
  nextMessagesContext: number
  imageHandling: ImageHandlingMode
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  timezone: 'Asia/Almaty',
  weekStartsOn: 'monday',
  language: 'ru',
  theme: 'system',
  semesterStart: '2026-09-01',
  semesterEnd: '2026-12-12',
  anchorWeekDate: '2026-09-01',
  anchorWeekType: 'odd',
  temporaryParityEnabled: false,
  temporaryParityDate: '2026-09-07',
  temporaryParityType: 'even',
  automationEnabled: true,
  automationMode: 'scheduled',
  processingTimes: ['08:00', '20:00'],
  intervalHours: 6,
  autoApply: {
    homework: false,
    notes: false,
    materials: false,
    room: false,
    online: false,
    cancellation: false,
    move: false,
    time: false,
  },
  minimumConfidence: 92,
  previousMessagesContext: 5,
  nextMessagesContext: 3,
  imageHandling: 'archive',
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
  const [syncError, setSyncError] = useState<string | null>(null)
  const settingsRef = useRef(settings)

  useEffect(() => {
    let active = true
    campusApi.settings().then((remote) => {
      if (!active) return
      const hydrated = hydrateAppSettings(remote, DEFAULT_APP_SETTINGS)
      settingsRef.current = hydrated
      setSettings(hydrated)
    }).catch(() => setSyncError('Не удалось загрузить настройки. Показаны стандартные значения.'))
    return () => { active = false }
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && media.matches)
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    }
    applyTheme()
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [settings.theme])

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    const next = { ...settingsRef.current, ...patch }
    settingsRef.current = next
    setSettings(next)
    void Promise.all([
      campusApi.updateSetting('app', next),
      campusApi.updateSetting('academic_period', { semesterStart: next.semesterStart, semesterEnd: next.semesterEnd, anchorWeekDate: next.anchorWeekDate, anchorWeekType: next.anchorWeekType }),
      campusApi.updateSetting('automation', toAutomationSetting(next)),
      campusApi.updateSetting('images', { mode: next.imageHandling }),
    ]).then(() => setSyncError(null)).catch(() => setSyncError('Настройки не сохранены. Проверьте подключение и повторите изменение.'))
  }, [])

  return { settings, updateSettings, syncError }
}
