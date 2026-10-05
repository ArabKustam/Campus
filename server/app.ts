import express, { type NextFunction, type Request, type Response } from 'express'
import type { TelegramIntegrationService } from './telegram/service.js'
import type { WhatsAppIntegrationService } from './whatsapp/service.js'

type ApiDependencies = {
  telegram: TelegramIntegrationService
  whatsapp?: WhatsAppIntegrationService
  whatsappBridgeSecret?: string
}

export function createApiApp({ telegram, whatsapp, whatsappBridgeSecret = '' }: ApiDependencies) {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '2mb' }))
  app.use('/api', (_request, response, next) => {
    response.setHeader('cache-control', 'no-store')
    next()
  })

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true })
  })

  app.get('/api/integrations/telegram', (_request, response) => {
    response.json(telegram.getState())
  })

  app.post('/api/integrations/telegram/connect', async (request, response, next) => {
    try {
      const botToken = typeof request.body?.botToken === 'string' ? request.body.botToken : ''
      response.status(201).json(await telegram.connect(botToken))
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/integrations/telegram/test', async (_request, response, next) => {
    try {
      response.json(await telegram.testConnection())
    } catch (error) {
      next(error)
    }
  })

  app.patch('/api/integrations/telegram/groups/:chatId', (request, response, next) => {
    try {
      if (typeof request.body?.selected !== 'boolean') {
        response.status(400).json({ error: 'Поле selected должно быть boolean' })
        return
      }
      response.json(telegram.setGroupSelected(request.params.chatId, request.body.selected))
    } catch (error) {
      next(error)
    }
  })

  app.delete('/api/integrations/telegram', async (_request, response, next) => {
    try {
      response.json(await telegram.disconnect())
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/integrations/whatsapp', async (_request, response, next) => {
    try {
      if (!whatsapp) throw new Error('WhatsApp bridge is not configured')
      response.json(await whatsapp.getState())
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/integrations/whatsapp/connect', async (_request, response, next) => {
    try {
      if (!whatsapp) throw new Error('WhatsApp bridge is not configured')
      response.status(201).json(await whatsapp.connect())
    } catch (error) {
      next(error)
    }
  })

  app.put('/api/integrations/whatsapp/groups/:groupId', async (request, response, next) => {
    try {
      if (!whatsapp) throw new Error('WhatsApp bridge is not configured')
      response.json(await whatsapp.selectGroup(request.params.groupId))
    } catch (error) {
      next(error)
    }
  })

  app.delete('/api/integrations/whatsapp', async (_request, response, next) => {
    try {
      if (!whatsapp) throw new Error('WhatsApp bridge is not configured')
      response.json(await whatsapp.disconnect())
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/bridges/whatsapp/messages', async (request, response, next) => {
    try {
      if (!whatsapp || !whatsappBridgeSecret) throw new Error('WhatsApp bridge is not configured')
      if (request.header('x-whatsapp-bridge-secret') !== whatsappBridgeSecret) {
        response.status(401).json({ error: 'Invalid bridge secret' })
        return
      }
      response.json({ stored: await whatsapp.ingestBridgeMessage(request.body) })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/webhooks/telegram/:secret', (request, response, next) => {
    try {
      const headerSecret = request.header('x-telegram-bot-api-secret-token')
      if (!headerSecret || headerSecret !== request.params.secret) {
        response.status(401).json({ error: 'Invalid webhook secret' })
        return
      }
      response.json(telegram.ingestWebhook(request.params.secret, request.body))
    } catch (error) {
      next(error)
    }
  })

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка'
    const isValidationError = /format|not found|не подключён|required|must|HTTPS/i.test(message)
    response.status(isValidationError ? 400 : 502).json({ error: message })
  })

  return app
}
