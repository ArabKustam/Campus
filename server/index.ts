import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import express from 'express'
import { createApiApp } from './app.js'
import { createTelegramIntegrationService } from './telegram/service.js'
import { createTelegramStore } from './telegram/store.js'
import { createMockWhatsAppBridge } from './whatsapp/mock-bridge.js'
import { createWhatsAppIntegrationService } from './whatsapp/service.js'
import { createWhatsAppStore } from './whatsapp/store.js'

try {
  process.loadEnvFile('.env')
} catch {
  // Environment variables may be supplied by the process manager instead.
}

const dataDirectory = path.resolve(process.env.CAMPUS_DATA_DIR || '.data')
mkdirSync(dataDirectory, { recursive: true })

function loadEncryptionKey() {
  const configured = process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY
  if (configured) {
    const key = Buffer.from(configured, 'base64')
    if (key.length !== 32) throw new Error('TELEGRAM_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key')
    return key
  }

  const keyPath = path.join(dataDirectory, 'telegram-token.key')
  if (existsSync(keyPath)) return readFileSync(keyPath)
  const key = randomBytes(32)
  writeFileSync(keyPath, key, { mode: 0o600 })
  return key
}

function loadBridgeSecret() {
  if (process.env.WHATSAPP_BRIDGE_SECRET) return process.env.WHATSAPP_BRIDGE_SECRET
  const secretPath = path.join(dataDirectory, 'whatsapp-bridge.key')
  if (existsSync(secretPath)) return readFileSync(secretPath, 'utf8').trim()
  const secret = randomBytes(32).toString('base64url')
  writeFileSync(secretPath, secret, { mode: 0o600 })
  return secret
}

const databasePath = path.join(dataDirectory, 'campus.sqlite')
const store = createTelegramStore(databasePath)
const whatsappStore = createWhatsAppStore(databasePath)
const telegram = createTelegramIntegrationService({
  store,
  webhookBaseUrl: process.env.TELEGRAM_WEBHOOK_BASE_URL || '',
  encryptionKey: loadEncryptionKey(),
})
const whatsapp = createWhatsAppIntegrationService({ store: whatsappStore, bridge: createMockWhatsAppBridge() })
const app = createApiApp({ telegram, whatsapp, whatsappBridgeSecret: loadBridgeSecret() })
const distDirectory = path.resolve('dist')
if (existsSync(distDirectory)) app.use(express.static(distDirectory))

const port = Number(process.env.PORT || 8787)
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Campus backend: http://127.0.0.1:${port}`)
})

function shutdown() {
  server.close(() => {
    store.close()
    whatsappStore.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
