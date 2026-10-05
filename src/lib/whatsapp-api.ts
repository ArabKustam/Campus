import { requestApi } from './api-client'

export type WhatsAppGroup = {
  id: string
  name: string
  selected: boolean
}

export type WhatsAppIntegrationState = {
  status: 'disconnected' | 'pairing' | 'connected'
  connected: boolean
  qrDataUrl: string | null
  lastSyncAt: string | null
  groups: WhatsAppGroup[]
  bridgeMode: 'external'
}

export const whatsappApi = {
  getState: () => requestApi<WhatsAppIntegrationState>('/api/integrations/whatsapp'),
  connect: () => requestApi<WhatsAppIntegrationState>('/api/integrations/whatsapp/connect', { method: 'POST' }),
  disconnect: () => requestApi<WhatsAppIntegrationState>('/api/integrations/whatsapp', { method: 'DELETE' }),
  selectGroup: (groupId: string) => requestApi<WhatsAppIntegrationState>(`/api/integrations/whatsapp/groups/${encodeURIComponent(groupId)}`, { method: 'PUT' }),
}
