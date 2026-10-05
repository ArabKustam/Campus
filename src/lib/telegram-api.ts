import { requestApi } from './api-client'

export type TelegramGroup = {
  chatId: string
  chatName: string
  selected: boolean
  lastMessageAt: string
}

export type TelegramIntegrationState = {
  connected: boolean
  status: 'disconnected' | 'connected' | 'error'
  bot: { id: number; name: string; username: string } | null
  connectedAt: string | null
  lastTestedAt: string | null
  groups: TelegramGroup[]
}

export type TelegramTestResult = {
  ok: boolean
  bot: { id: number; name: string; username: string }
  webhook: { pendingUpdates: number; lastError: string | null }
  testedAt: string
}

export const telegramApi = {
  getState: () => requestApi<TelegramIntegrationState>('/api/integrations/telegram'),
  connect: (botToken: string) => requestApi<TelegramIntegrationState>('/api/integrations/telegram/connect', {
    method: 'POST',
    body: JSON.stringify({ botToken }),
  }),
  disconnect: () => requestApi<TelegramIntegrationState>('/api/integrations/telegram', { method: 'DELETE' }),
  test: () => requestApi<TelegramTestResult>('/api/integrations/telegram/test', { method: 'POST' }),
  selectGroup: (chatId: string, selected: boolean) => requestApi<TelegramIntegrationState>(`/api/integrations/telegram/groups/${encodeURIComponent(chatId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ selected }),
  }),
}
