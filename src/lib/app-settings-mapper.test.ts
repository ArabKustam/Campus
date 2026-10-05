import { describe, expect, it } from 'vitest'
import { DEFAULT_APP_SETTINGS } from '../hooks/use-app-settings'
import { hydrateAppSettings, toAutomationSetting } from './app-settings-mapper'

describe('app settings hydration', () => {
  it('maps the server automation contract into UI settings', () => {
    const settings = hydrateAppSettings({
      automation: {
        value: {
          enabled: false,
          mode: 'interval',
          times: ['09:30', '21:15'],
          intervalHours: 4,
          minimumConfidence: 0.87,
          previousMessages: 7,
          nextMessages: 2,
          autoApply: {
            homework: true,
            notes: true,
            materials: false,
            cancellation: true,
            move: false,
            room: true,
            time: true,
            online: false,
          },
        },
      },
    }, DEFAULT_APP_SETTINGS)

    expect(settings).toMatchObject({
      automationEnabled: false,
      automationMode: 'interval',
      processingTimes: ['09:30', '21:15'],
      intervalHours: 4,
      minimumConfidence: 87,
      previousMessagesContext: 7,
      nextMessagesContext: 2,
      autoApply: {
        homework: true,
        notes: true,
        materials: false,
        cancellation: true,
        move: false,
        room: true,
        time: true,
        online: false,
      },
    })
  })

  it('does not claim any auto-apply capability when the server omits autoApply', () => {
    const settings = hydrateAppSettings({ automation: { value: { enabled: true } } }, DEFAULT_APP_SETTINGS)

    expect(settings.autoApply).toEqual({
      homework: false,
      notes: false,
      materials: false,
      cancellation: false,
      move: false,
      room: false,
      time: false,
      online: false,
    })
  })

  it('serializes UI automation settings with the Worker field names and confidence fraction', () => {
    expect(toAutomationSetting({
      ...DEFAULT_APP_SETTINGS,
      minimumConfidence: 87,
      previousMessagesContext: 7,
      nextMessagesContext: 2,
    })).toEqual({
      enabled: true,
      mode: 'scheduled',
      times: ['08:00', '20:00'],
      intervalHours: 6,
      minimumConfidence: 0.87,
      previousMessages: 7,
      nextMessages: 2,
      autoApply: DEFAULT_APP_SETTINGS.autoApply,
    })
  })
})
