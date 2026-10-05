import type { AppSettings } from '../hooks/use-app-settings'

type RemoteSetting = { value?: Record<string, unknown> }
type RemoteSettings = Record<string, RemoteSetting | undefined>

const AUTO_APPLY_KEYS = [
  'homework',
  'notes',
  'materials',
  'cancellation',
  'move',
  'room',
  'time',
  'online',
] as const satisfies ReadonlyArray<keyof AppSettings['autoApply']>

function mapAutoApply(value: unknown): AppSettings['autoApply'] {
  const remote = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return Object.fromEntries(AUTO_APPLY_KEYS.map((key) => [key, remote[key] === true])) as AppSettings['autoApply']
}

export function hydrateAppSettings(remote: RemoteSettings, defaults: AppSettings): AppSettings {
  const app = remote.app?.value ?? {}
  const academic = remote.academic_period?.value ?? {}
  const automation = remote.automation?.value ?? {}
  const images = remote.images?.value ?? {}

  return {
    ...defaults,
    ...app,
    semesterStart: typeof academic.semesterStart === 'string' ? academic.semesterStart : defaults.semesterStart,
    semesterEnd: typeof academic.semesterEnd === 'string' ? academic.semesterEnd : defaults.semesterEnd,
    anchorWeekDate: typeof academic.anchorWeekDate === 'string' ? academic.anchorWeekDate : defaults.anchorWeekDate,
    anchorWeekType: academic.anchorWeekType === 'even' ? 'even' : 'odd',
    automationEnabled: typeof automation.enabled === 'boolean' ? automation.enabled : defaults.automationEnabled,
    automationMode: automation.mode === 'interval' ? 'interval' : automation.mode === 'scheduled' ? 'scheduled' : defaults.automationMode,
    processingTimes: Array.isArray(automation.times) && automation.times.every((time) => typeof time === 'string')
      ? automation.times
      : defaults.processingTimes,
    intervalHours: typeof automation.intervalHours === 'number' ? automation.intervalHours : defaults.intervalHours,
    autoApply: mapAutoApply(automation.autoApply),
    minimumConfidence: typeof automation.minimumConfidence === 'number'
      ? automation.minimumConfidence * 100
      : defaults.minimumConfidence,
    previousMessagesContext: typeof automation.previousMessages === 'number'
      ? automation.previousMessages
      : defaults.previousMessagesContext,
    nextMessagesContext: typeof automation.nextMessages === 'number'
      ? automation.nextMessages
      : defaults.nextMessagesContext,
    imageHandling: images.mode === 'analyze' || images.mode === 'ignore' ? images.mode : 'archive',
  }
}

export function toAutomationSetting(settings: AppSettings): Record<string, unknown> {
  return {
    enabled: settings.automationEnabled,
    mode: settings.automationMode,
    times: settings.processingTimes,
    intervalHours: settings.intervalHours,
    minimumConfidence: settings.minimumConfidence / 100,
    previousMessages: settings.previousMessagesContext,
    nextMessages: settings.nextMessagesContext,
    autoApply: settings.autoApply,
  }
}
