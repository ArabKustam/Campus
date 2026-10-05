// Domain tests use the private router. Security tests exercise the public gateway separately.
import { app } from '../app'
import { telegramRoutes } from '../routes/telegram'
import { whatsappRoutes } from '../routes/whatsapp'
app.route('/api', telegramRoutes)
app.route('/api', whatsappRoutes)
export default { fetch: app.fetch }

export { Workspace } from '../workspace/object'
