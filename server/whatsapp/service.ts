import { whatsappMessageSource, type WhatsAppBridgeMessagePayload } from '../sources/message-source.js'
import type { WhatsAppBridge } from './mock-bridge.js'
import type { WhatsAppStore } from './store.js'

type WhatsAppServiceOptions = {
  store: WhatsAppStore
  bridge: WhatsAppBridge
}

export function createWhatsAppIntegrationService({ store, bridge }: WhatsAppServiceOptions) {
  async function syncState() {
    const bridgeState = await bridge.getState()
    store.saveIntegration(bridgeState.status, bridgeState.qrDataUrl, bridgeState.lastSyncAt)
    if (bridgeState.groups.length) store.replaceGroups(bridgeState.groups)
    const groups = store.listGroups()
    await bridge.setAllowedGroups(groups.filter((group) => group.selected).map((group) => group.id))
    return {
      status: bridgeState.status,
      connected: bridgeState.status === 'connected',
      qrDataUrl: bridgeState.qrDataUrl,
      lastSyncAt: bridgeState.lastSyncAt,
      groups,
      bridgeMode: 'external' as const,
    }
  }

  async function connect() {
    const bridgeState = await bridge.startPairing()
    store.saveIntegration(bridgeState.status, bridgeState.qrDataUrl, bridgeState.lastSyncAt)
    return syncState()
  }

  async function selectGroup(groupId: string) {
    store.selectGroup(groupId)
    await bridge.setAllowedGroups([groupId])
    return syncState()
  }

  function ingestBridgeMessage(payload: WhatsAppBridgeMessagePayload) {
    const message = whatsappMessageSource.normalize(payload)
    if (!message) return false
    const selected = store.listGroups().some((group) => group.id === message.chatId && group.selected)
    if (!selected) return false
    return store.insertMessage(message)
  }

  async function disconnect() {
    await bridge.disconnect()
    store.saveIntegration('disconnected', null, null)
    return syncState()
  }

  return {
    connect,
    disconnect,
    getState: syncState,
    ingestBridgeMessage,
    selectGroup,
  }
}

export type WhatsAppIntegrationService = ReturnType<typeof createWhatsAppIntegrationService>
