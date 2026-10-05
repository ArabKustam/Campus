import QRCode from 'qrcode'
import { randomBytes } from 'node:crypto'
import type { WhatsAppBridgeMessagePayload } from '../sources/message-source.js'

export type WhatsAppBridgeGroup = {
  id: string
  name: string
}

export type WhatsAppBridgeState = {
  status: 'disconnected' | 'pairing' | 'connected'
  qrDataUrl: string | null
  lastSyncAt: string | null
  groups: WhatsAppBridgeGroup[]
}

export interface WhatsAppBridge {
  startPairing(): Promise<WhatsAppBridgeState>
  getState(): Promise<WhatsAppBridgeState>
  setAllowedGroups(groupIds: string[]): Promise<void>
  disconnect(): Promise<void>
}

export interface MockWhatsAppBridge extends WhatsAppBridge {
  completePairing(): void
  getAllowedGroupIds(): string[]
  deliver(payload: WhatsAppBridgeMessagePayload, receiver: (message: WhatsAppBridgeMessagePayload) => boolean | Promise<boolean>): Promise<boolean>
}

const mockGroups: WhatsAppBridgeGroup[] = [
  { id: '120363001@g.us', name: 'ИБ-23 · Общая группа' },
  { id: '120363002@g.us', name: 'Практикум по программированию' },
]

export function createMockWhatsAppBridge(): MockWhatsAppBridge {
  let state: WhatsAppBridgeState = { status: 'disconnected', qrDataUrl: null, lastSyncAt: null, groups: [] }
  let allowedGroupIds: string[] = []
  let pairingStartedAt = 0

  const completePairing = () => {
    state = { status: 'connected', qrDataUrl: null, lastSyncAt: new Date().toISOString(), groups: mockGroups }
  }

  return {
    async startPairing() {
      const pairingPayload = `campus-whatsapp-bridge:${randomBytes(20).toString('base64url')}`
      const svg = await QRCode.toString(pairingPayload, { type: 'svg', margin: 1, width: 256 })
      state = {
        status: 'pairing',
        qrDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
        lastSyncAt: null,
        groups: [],
      }
      pairingStartedAt = Date.now()
      return state
    },

    async getState() {
      if (state.status === 'pairing' && Date.now() - pairingStartedAt >= 1_500) completePairing()
      return { ...state, groups: [...state.groups] }
    },

    completePairing() {
      completePairing()
    },

    async setAllowedGroups(groupIds) {
      allowedGroupIds = [...new Set(groupIds)]
    },

    getAllowedGroupIds() {
      return [...allowedGroupIds]
    },

    async deliver(payload, receiver) {
      if (!payload.isGroup || !allowedGroupIds.includes(payload.chatId)) return false
      return receiver(payload)
    },

    async disconnect() {
      state = { status: 'disconnected', qrDataUrl: null, lastSyncAt: null, groups: [] }
      allowedGroupIds = []
    },
  }
}
