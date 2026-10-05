import {accountFeatures,requiredFeature} from './permissions'
import {journalRoutes} from './routes/platonus-journal'
import {platonusFileRoutes} from './routes/platonus-files'
import { platonusCloudRoutes } from './routes/platonus-cloud'
import { platonusRoutes } from './routes/platonus'
import { teacherRoutes } from './routes/teachers'
import { historyRoutes } from './routes/history'
import { assistantRoutes } from './routes/assistant'
import { catalogRoutes } from './routes/catalog'
import { peopleRoutes } from './routes/people'
import { personalRoutes } from './routes/personal'
import { Hono } from 'hono'
import { apiError, ok } from './lib/api'
import { actionRoutes } from './routes/actions'
import { attachmentRoutes } from './routes/attachments'
import { homeworkRoutes } from './routes/homework'
import { overrideRoutes } from './routes/lesson-overrides'
import { materialRoutes } from './routes/materials'
import { messageRoutes } from './routes/messages'
import { processingRoutes } from './routes/processing'
import { scheduleRoutes } from './routes/schedule'
import { settingRoutes } from './routes/settings'
import type { Bindings } from './types'

export const app = new Hono<{ Bindings: Bindings }>()
app.use('/api/*',async(c,next)=>{
 const feature=requiredFeature(c.req.path);if((c.env.REGISTRY||c.env.ADMIN_ACCOUNT_ID)&&c.env.OWNER_ID&&!c.env.OWNER_ID.startsWith('group:')&&feature&&!(await accountFeatures(c.env,c.env.OWNER_ID)).includes(feature))return apiError(c,403,'FEATURE_PREVIEW','Доступ к этому разделу пока не выдан.')
 await next()
})

app.use('*', async (c, next) => {
  c.header('x-request-id', crypto.randomUUID())
  if (c.req.path.startsWith('/api/')) c.header('cache-control', 'no-store')
  await next()
})

app.get('/health', (c) => ok(c, { service: 'campus-worker' }))

app.route('/api', journalRoutes)
app.route('/api', platonusRoutes)
app.route('/api', platonusCloudRoutes)
app.route('/api', platonusFileRoutes)
app.route('/api', teacherRoutes)
app.route('/api', historyRoutes)
app.route('/api', assistantRoutes)
app.route('/api', catalogRoutes)
app.route('/api', peopleRoutes)
app.route('/api', personalRoutes)
app.route('/api', scheduleRoutes)
app.route('/api', overrideRoutes)
app.route('/api', homeworkRoutes)
app.route('/api', materialRoutes)
app.route('/api', messageRoutes)
app.route('/api', processingRoutes)
app.route('/api', actionRoutes)
app.route('/api', attachmentRoutes)
app.route('/api', settingRoutes)

app.notFound((c) => apiError(c, 404, 'NOT_FOUND', 'Маршрут не найден'))
app.onError((error, c) => {
  const message = error instanceof Error ? error.message : 'Unknown error'
  if (message.includes('FOREIGN KEY constraint failed')) return apiError(c, 422, 'REFERENCE_NOT_FOUND', 'Связанная запись не найдена')
  if (message.includes('UNIQUE constraint failed')) return apiError(c, 409, 'CONFLICT', 'Такая запись уже существует')
  console.error(JSON.stringify({ event: 'request_failed', requestId: c.res.headers.get('x-request-id'), error: message.slice(0, 500) }))
  return apiError(c, 500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера')
})

export type AppType = typeof app
