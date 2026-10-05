import { PlatonusSession } from './platonus.js'
import { startWhatsApp, readableWhatsAppError } from './whatsapp-start.js'
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import QRCode from 'qrcode'
import { TelegramClient, type Message as TgMessage } from '@mtcute/node'
import WhatsApp from 'whatsapp-web.js'
const { Client, LocalAuth } = WhatsApp
process.umask(0o077)
const root = fileURLToPath(new URL('./.data/', import.meta.url))
await mkdir(root, { recursive: true, mode: 0o700 })
try { process.loadEnvFile(fileURLToPath(new URL('./.env', import.meta.url))) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
const appOrigin = new URL(process.env.CAMPUS_APP_URL ?? 'http://localhost:5173').origin
if (!appOrigin.startsWith('https://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(appOrigin)) throw new Error('CAMPUS_APP_URL must use HTTPS')
const cutoff = Date.parse('2026-08-29T19:00:00.000Z')
const maxFile = 20 * 1024 * 1024
const mimeAllowed = /^(application\/(pdf|msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|presentationml\.presentation)|vnd\.ms-powerpoint)|image\/(png|jpeg|webp|gif))$/
type Provider = 'telegram' | 'whatsapp'
type Config = { accountId: string; token: string; provider: Provider; localToken: string; apiId?: number; apiHash?: string; cursors: Record<string, number>; revision: number; appOrigin: string }
type RemoteState = { desired: string; revision: number; groups: { id: string; name: string; selected: number }[] }
type RemoteConfig = { accountId: string; telegram: RemoteState; whatsapp: RemoteState }
const platonusSessions = new Map<string,{accountId:string;token:string;session:PlatonusSession}>()
const sessions = new Map<string, Session>()
const accounts = new Map<string, Session>()
async function api<T>(token: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${appOrigin}/api/connector/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${token}`, ...(body instanceof FormData ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }), signal: AbortSignal.timeout(path==='analyze'?120000:30000) })
  const result = await response.json() as { ok: boolean; data: T; error?: { message: string } }
  if (!response.ok || !result.ok) throw new Error(response.status === 401 ? 'TOKEN_REVOKED' : result.error?.message ?? 'Сайт недоступен')
  return result.data
}
class Session {
  phase = 'Подготовка входа'; analysis: { status:string; messages:number; actions:number; error:string|null } = {status:'idle',messages:0,actions:0,error:null}; groupRefresh = 0
  status = 'pairing'; qr: string | null = null; error: string | null = null; needsPassword = false; imported = 0
  tg?: TelegramClient; wa?: InstanceType<typeof Client>; resolvePassword?: (password: string) => void
  stopped = false; running = false; timer?: ReturnType<typeof setInterval>; controlTimer?: ReturnType<typeof setInterval>; abort = new AbortController()
  constructor(public config: Config) {}
  directory() { return join(root, `${this.config.accountId}-${this.config.provider}`) }
  async save() { await mkdir(this.directory(), { recursive: true, mode: 0o700 }); await writeFile(join(this.directory(), 'connector.json'), JSON.stringify(this.config), { mode: 0o600 }) }
  state() { return { status: this.status, qr: this.qr, error: this.error, needsPassword: this.needsPassword, imported: this.imported, phase:this.phase, analysis:this.analysis, version:2 } }
  async report() { await api(this.config.token, 'status', { provider: this.config.provider, revision: this.config.revision, status: this.status, error: this.error }) }
  async start() {
    await this.save()
    this.controlTimer = setInterval(() => {
      if (this.stopped || this.status === 'connected') return
      void api<RemoteConfig>(this.config.token, 'config').then((remote) => {
        const state = remote[this.config.provider]
        if (state.desired !== 'connected' || state.revision !== this.config.revision) void this.stop()
      }).catch((error) => { if (error instanceof Error && error.message === 'TOKEN_REVOKED') void this.stop() })
    }, 5000)
    try {
      if (this.config.provider === 'telegram') {
        if (!this.config.apiId || !this.config.apiHash) throw new Error('Нужны Telegram API ID и API Hash')
        this.tg = new TelegramClient({ apiId: this.config.apiId, apiHash: this.config.apiHash, storage: join(this.directory(), 'telegram.sqlite'), disableUpdates: true, logLevel: 0 })
        await this.tg.start({ abortSignal: this.abort.signal, qrCodeHandler: (url) => { void QRCode.toDataURL(url).then((qr) => { if (!this.stopped) this.qr = qr }) }, password: () => new Promise<string>((resolve) => { this.needsPassword = true; this.resolvePassword = (password) => { this.needsPassword = false; resolve(password) } }) })
        if (this.stopped) return
        this.status = 'connected'; this.qr = null; await this.report()
      } else {
        this.wa = await startWhatsApp(() => {
          const client = new Client({ deviceName:'Campus Connector', browserName:'Chrome', authTimeoutMs:180000, authStrategy: new LocalAuth({ dataPath: join(this.directory(), 'whatsapp') }), webVersionCache: { type: 'none' }, puppeteer: { headless: true, ...(process.env.CAMPUS_CHROME_PATH ? { executablePath: process.env.CAMPUS_CHROME_PATH } : {}) } })
          this.wa = client
          client.on('qr', (url: string) => { void QRCode.toDataURL(url).then((qr) => { if (!this.stopped && this.wa === client) { this.qr = qr; this.error = null } }) })
          client.on('authenticated',()=>{if(this.wa===client){this.qr=null;this.phase='Вход подтверждён. WhatsApp загружает чаты…'}})
          client.on('loading_screen',(percent:number)=>{if(this.wa===client)this.phase=`Загрузка WhatsApp: ${percent}%`})
          client.on('disconnected', () => { if (!this.stopped && this.wa === client) { this.status = 'disconnected'; this.error = 'WhatsApp отключён. Повторите вход.'; void this.report().catch(()=>{}) } })
          return client
        }, this.abort.signal, (attempt) => { this.qr = null; this.status = 'pairing'; this.error = `WhatsApp прервал загрузку. Повторная попытка ${attempt} из 3…` })
        if (this.stopped) return
        this.status = 'connected'; this.qr = null; await this.report()
      }
      this.phase='Аккаунт подключён'
      await this.refreshGroups().catch(error=>{this.error=readableWhatsAppError(error,'список чатов')})
      this.timer = setInterval(() => void this.sync(), 15000)
      await this.sync()
    } catch (error) {
      if (!this.stopped) { this.status = 'error'; this.phase='Ошибка подключения'; this.error = readableWhatsAppError(error,'подключение'); await this.report().catch(() => {}) }
    }
  }
  async refreshGroups(){
    const groups:{id:string;name:string;avatar?:string|null}[]=[]
    if(this.tg){
      for await(const dialog of this.tg.iterDialogs({limit:500})){
        if(dialog.peer.type!=='chat')continue
        const thumb=dialog.peer.photo?.thumb
        groups.push({id:String(dialog.peer.id),name:dialog.peer.displayName.slice(0,200),avatar:thumb&&thumb.length<60000?`data:image/jpeg;base64,${Buffer.from(thumb).toString('base64')}`:null})
      }
    }else if(this.wa){
      const chats=(await this.wa.getChats()).filter(c=>c.isGroup).sort((a,b)=>Number(Boolean(b.pinned))-Number(Boolean(a.pinned))||b.timestamp-a.timestamp).slice(0,500)
      for(let offset=0;offset<chats.length;offset+=25)await api(this.config.token,'groups',{provider:this.config.provider,revision:this.config.revision,offset,groups:chats.slice(offset,offset+25).map(chat=>({id:chat.id._serialized,name:chat.name.slice(0,200)}))})
      for(let start=0;start<chats.length;start+=8){
       groups.push(...await Promise.all(chats.slice(start,start+8).map(async chat=>{
        let avatar:string|null=null
        try{
          const url=await this.wa!.getProfilePicUrl(chat.id._serialized)
          if(url&&/^https:\/\/[^/]+\.(?:whatsapp\.net|whatsapp\.com)\//.test(url)){
            const response=await fetch(url,{signal:AbortSignal.timeout(3000),redirect:'error'})
            if(response.ok&&response.body){const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>60000)break;chunks.push(part.value)}if(size<=60000&&/^image\/(jpeg|png|webp)$/.test(response.headers.get('content-type')??''))avatar=`data:${response.headers.get('content-type')};base64,${Buffer.concat(chunks).toString('base64')}`}finally{await reader.cancel()}}
          }
        }catch{/* A private or missing avatar must not prevent connecting. */}
        return {id:chat.id._serialized,name:chat.name.slice(0,200),avatar}
       })))
      }
    }
    for(let offset=0;offset<groups.length;offset+=25)await api(this.config.token,'groups',{provider:this.config.provider,revision:this.config.revision,offset,groups:groups.slice(offset,offset+25)})
    this.groupRefresh=Date.now()
  }
  async analyzeNow(){
    if(['syncing','analyzing'].includes(this.analysis.status))return
    if(this.status!=='connected')throw new Error('Сначала подключите аккаунт мессенджера')
    this.analysis={status:'syncing',messages:0,actions:0,error:null}
    void (async()=>{
      try{
        while(this.running&&!this.stopped)await new Promise(resolve=>setTimeout(resolve,250))
        await this.sync(1000)
        if(this.error||this.stopped)throw new Error(this.error??'Коннектор остановлен')
        this.analysis.status='analyzing'
        for(let batch=0;batch<50&&!this.stopped;batch++){
          const run=await api<{status:string;messagesScanned:number;actionsCreated:number;error:string|null}>(this.config.token,'analyze',{})
          if(run.status==='failed')throw new Error(run.error??'Ошибка AI')
          this.analysis.messages+=run.messagesScanned;this.analysis.actions+=run.actionsCreated
          if(run.messagesScanned===0){this.analysis.status='completed';return}
        }
        this.analysis.status='completed';this.analysis.error='За запуск обработано до 1000 сообщений. Для оставшихся нажмите кнопку ещё раз.'
      }catch(error){this.analysis.status='failed';this.analysis.error=readableWhatsAppError(error,'анализ')}
    })()
  }
  async send(input: { externalChatId: string; externalMessageId: string; chatName: string; sender: { id: string; name: string; username?:string|null; phone?:string|null }; text: string | null; sentAt: string; replyTo: { externalMessageId: string; text: null } | null; messageType: string }, attachment?: () => Promise<{ data: Uint8Array; type: string; name: string } | null>) {
    if (this.stopped || Date.parse(input.sentAt) < cutoff) return
    // Recheck the authoritative allowlist immediately before every upload, including history batches.
    const config = await api<RemoteConfig>(this.config.token, 'config')
    const current = config[this.config.provider]
    if (current.desired !== 'connected' || current.revision !== this.config.revision) { await this.stop(); return }
    if (!current.groups.some((group) => group.id === input.externalChatId && group.selected)) return
    const result = await api<{ stored: boolean; messageId: string | null; needsAttachment?: boolean }>(this.config.token, 'messages', { provider: this.config.provider, ...input })
    if (result.stored) this.imported++
    if (result.messageId && (result.stored || result.needsAttachment) && attachment) {
      const file = await attachment()
      if (file && file.data.byteLength <= maxFile && mimeAllowed.test(file.type)) {
        const body = new FormData(); body.set('file', new Blob([file.data as BlobPart], { type: file.type }), file.name)
        await api(this.config.token, `attachments/${result.messageId}`, body)
      }
    }
  }
  async telegramMessage(message: TgMessage, chatName: string) {
    const media = message.media
    const downloadable = media && (media.type === 'photo' || media.type === 'document') && media.fileSize !== undefined && media.fileSize <= maxFile
    await this.send({ externalChatId: String(message.chat.id), externalMessageId: String(message.id), chatName,
      sender: { id: String(message.sender.id), name: message.sender.displayName.slice(0, 200),username:message.sender.username,phone:message.sender.type==='user'?message.sender.phoneNumber:null }, text: message.text || (media ? '[Вложение]' : ''), sentAt: message.date.toISOString(),
      replyTo: message.replyToMessage?.id ? { externalMessageId: String(message.replyToMessage.id), text: null } : null,
      messageType: media?.type === 'photo' ? 'image' : media ? 'document' : 'text' }, downloadable ? async () => ({ data: await this.tg!.downloadAsBuffer(media), type: media.type === 'photo' ? 'image/jpeg' : media.mimeType, name: media.type === 'photo' ? `${message.id}.jpg` : media.fileName ?? `${message.id}.bin` }) : undefined)
  }
  async sync(historyLimit=100) {
    if (this.running || this.stopped || this.status !== 'connected') return
    this.running = true
    try {
      const all = await api<RemoteConfig>(this.config.token, 'config'), current = all[this.config.provider]
      if (current.desired !== 'connected' || current.revision !== this.config.revision) { await this.stop(); return }
      if(Date.now()-this.groupRefresh>300000)await this.refreshGroups()
      await this.report()
      for (const group of current.groups.filter((group) => group.selected)) {
        if (this.stopped) break
        if (this.tg) {
          const last = this.config.cursors[group.id] ?? 0
          const messages = this.tg.iterHistory(Number(group.id), { reverse: true, offset: { id: last, date: last ? 0 : Math.floor(cutoff / 1000) }, minId: last, limit: historyLimit, chunkSize: 50 })
          for await (const message of messages) {
            if (this.stopped) break
            if (message.date.getTime() < cutoff) continue
            await this.telegramMessage(message, group.name)
            this.config.cursors[group.id] = message.id; await this.save()
          }
        } else if (this.wa) {
          const chat = await this.wa.getChatById(group.id)
          if (!chat.isGroup) continue
          // WhatsApp exposes the history synced to this linked device; this is not a promise of a complete archive.
          const last = this.config.cursors[group.id] ?? Math.floor(cutoff / 1000) - 1
          let limit = 100, previousLength = -1
          let history = await chat.fetchMessages({ limit })
          while (!this.stopped && history.length === limit && history.length !== previousLength && Math.min(...history.map((m) => m.timestamp)) > last) {
            previousLength = history.length; limit *= 2; history = await chat.fetchMessages({ limit })
          }
          for (const message of history.filter((msg) => msg.timestamp >= Math.floor(cutoff / 1000) && msg.timestamp >= last).sort((a,b) => a.timestamp - b.timestamp)) {
            if (this.stopped) break
            const size = (message.rawData as { size?: number }).size
            const canDownload = message.hasMedia && ['image','document'].includes(message.type) && typeof size === 'number' && size <= maxFile
            const contact = await message.getContact()
            const quote = message.hasQuotedMsg ? await message.getQuotedMessage().catch(() => null) : null
            const replyTo = quote && quote.timestamp * 1000 >= cutoff && quote.id.remote === group.id ? { externalMessageId: quote.id._serialized, text: null } : null
            await this.send({ externalChatId: group.id, externalMessageId: message.id._serialized, chatName: group.name,
              sender: { id: message.author ?? contact.id._serialized, name: (contact.name || contact.pushname || contact.number || 'Неизвестный отправитель').slice(0,200),phone:/^[1-9]\d{6,14}$/.test(contact.number??'')?contact.number:null }, text: message.body || (message.hasMedia ? '[Вложение]' : ''), sentAt: new Date(message.timestamp * 1000).toISOString(), replyTo,
              messageType: message.type === 'image' ? 'image' : message.hasMedia ? 'document' : 'text' }, canDownload ? async () => { const media = await message.downloadMedia(); if (!media || !mimeAllowed.test(media.mimetype) || (media.filesize && media.filesize > maxFile) || media.data.length > maxFile * 1.4) return null; return { data: Buffer.from(media.data, 'base64'), type: media.mimetype, name: media.filename ?? `${message.id.id}.bin` } } : undefined)
            this.config.cursors[group.id] = message.timestamp; await this.save()
          }
        }
      }
      this.error = null
    } catch (error) {
      this.error = readableWhatsAppError(error,'синхронизация')
      if (this.error === 'TOKEN_REVOKED') await this.stop()
    } finally { this.running = false; if(!this.stopped)await this.report().catch(()=>{}) }
  }
  async stop(logout = true) {
    if (this.stopped) return
    this.stopped = true; this.abort.abort(); clearInterval(this.timer); clearInterval(this.controlTimer); this.qr = null; this.status = 'disconnected'
    if (logout) { await this.tg?.logOut().catch(() => {}); await this.wa?.logout().catch(() => {}) }
    await this.tg?.destroy().catch(() => {}); await this.wa?.destroy().catch(() => {})
    if (logout) await rm(this.directory(), { recursive: true, force: true })
    accounts.delete(`${this.config.accountId}:${this.config.provider}`)
  }
}
const server = createServer(async (req,res) => {
  const send = (status: number, data: unknown) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(data)) }
  // Exact Origin + Host validation prevents arbitrary websites and DNS rebinding from operating the local sessions.
  if (!['127.0.0.1:3987','localhost:3987'].includes(req.headers.host ?? '') || req.headers.origin !== appOrigin) return send(403, { error: 'Этот сайт не разрешён в CAMPUS_APP_URL коннектора' })
  res.setHeader('access-control-allow-origin', appOrigin); res.setHeader('vary','Origin')
  res.setHeader('access-control-allow-headers','content-type, authorization, x-campus-local'); res.setHeader('access-control-allow-methods','GET, POST, OPTIONS'); res.setHeader('access-control-allow-private-network', 'true')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  if (req.headers['x-campus-local'] !== '1') return send(403, { error: 'Неверный запрос' })
  try {
    let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 8192) return send(413, { error: 'Слишком большой запрос' }) }
    const body = raw ? JSON.parse(raw) : {}
    if (req.url === '/health' && req.method === 'GET') return send(200, { ready: true })
    if(req.url==='/platonus/link'&&req.method==='POST'){
      if(typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))return send(400,{error:'Некорректное подключение'})
      const remote=await api<RemoteConfig>(body.token,'config')
      if(!/^[a-f0-9-]{36}$/.test(remote.accountId))return send(400,{error:'Некорректный аккаунт'})
      for(const [key,prior] of platonusSessions)if(prior.accountId===remote.accountId){await prior.session.close();platonusSessions.delete(key)}
      const localToken=randomBytes(32).toString('hex')
      const session=new PlatonusSession(join(root,`${remote.accountId}-platonus`),snapshot=>api(body.token,'platonus/snapshot',snapshot))
      platonusSessions.set(localToken,{accountId:remote.accountId,token:body.token,session});void session.open()
      return send(200,{localToken})
    }
    if(req.url?.startsWith('/platonus/')){
      const localToken=req.headers.authorization?.replace(/^Bearer /,'')??'',entry=platonusSessions.get(localToken)
      if(!entry)return send(401,{error:'Откройте окно входа Platonus заново'})
      // Revalidate the Campus account before reading or uploading any university data.
      const remote=await api<RemoteConfig>(entry.token,'config')
      if(remote.accountId!==entry.accountId)return send(401,{error:'Аккаунт изменился'})
      if(req.url==='/platonus/state'&&req.method==='GET')return send(200,entry.session.state())
      if(req.url==='/platonus/sync'&&req.method==='POST'){await entry.session.sync();return send(202,entry.session.state())}
      if(req.url==='/platonus/disconnect'&&req.method==='POST'){await entry.session.close();await rm(join(root,`${entry.accountId}-platonus`),{recursive:true,force:true});platonusSessions.delete(localToken);return send(200,{disconnected:true})}
      return send(404,{error:'Не найдено'})
    }
    if(req.url==='/resume'&&req.method==='POST'){
      const remote=await api<RemoteConfig>(body.token,'config');const session=accounts.get(`${remote.accountId}:${body.provider}`)
      if(!session||session.stopped) return send(409,{error:'На этом компьютере нет активного подключения. Запустите коннектор или повторите QR-вход.'})
      return send(200,{localToken:session.config.localToken})
    }
    if (req.url === '/link' && req.method === 'POST') {
      if (!['telegram','whatsapp'].includes(body.provider) || typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token)) return send(400, { error: 'Некорректное подключение' })
      const remote = await api<RemoteConfig>(body.token, 'config')
      if (!/^[a-f0-9-]{36}$/.test(remote.accountId)) return send(400, { error: 'Некорректный аккаунт' })
      const provider: Provider = body.provider
      const key = `${remote.accountId}:${provider}`
      await accounts.get(key)?.stop(false)
      let prior: Partial<Config> = {}; try { prior = JSON.parse(await readFile(join(root, `${remote.accountId}-${provider}`, 'connector.json'), 'utf8')) } catch {}
      const session = new Session({ accountId: remote.accountId, token: body.token, localToken: randomBytes(32).toString('hex'), provider, appOrigin, apiId: body.apiId ?? prior.apiId, apiHash: body.apiHash ?? prior.apiHash, cursors: prior.cursors ?? {}, revision: remote[provider].revision })
      sessions.set(session.config.localToken, session); accounts.set(key, session)
      void session.start(); return send(200, { localToken: session.config.localToken })
    }
    const token = req.headers.authorization?.replace(/^Bearer /,'')
    const session = token ? sessions.get(token) : undefined
    if (!session) return send(401, { error: 'Снова нажмите «Показать QR», чтобы связать это окно с коннектором' })
    if(req.url==='/analyze'&&req.method==='POST'){await session.analyzeNow();return send(202,session.state())}
    if (req.url === '/state' && req.method === 'GET') return send(200, session.state())
    if (req.url === '/password' && req.method === 'POST') { if (typeof body.password !== 'string' || !session.resolvePassword) return send(400, { error: 'Пароль сейчас не запрашивается' }); session.resolvePassword(body.password); session.resolvePassword = undefined; return send(200, { accepted: true }) }
    if (req.url === '/disconnect' && req.method === 'POST') { await session.stop(); return send(200, { disconnected: true }) }
    send(404, { error: 'Не найдено' })
  } catch (error) { send(400, { error: error instanceof Error ? error.message.slice(0,300) : 'Ошибка коннектора' }) }
})
server.listen(3987, '127.0.0.1', () => console.log(`Campus connector ready on 127.0.0.1:3987; allowed site: ${appOrigin}`))
for (const dir of await readdir(root, { withFileTypes: true })) {
  if (!dir.isDirectory() || !/^[a-f0-9-]{36}-(telegram|whatsapp)$/.test(dir.name)) continue
  try {
    const config: Config = JSON.parse(await readFile(join(root, dir.name, 'connector.json'), 'utf8'))
    if (config.appOrigin !== appOrigin) continue
    const remote = await api<RemoteConfig>(config.token, 'config')
    if (remote.accountId !== config.accountId || remote[config.provider].desired !== 'connected' || remote[config.provider].revision !== config.revision) continue
    const session = new Session(config); sessions.set(config.localToken, session); accounts.set(`${config.accountId}:${config.provider}`, session); void session.start()
  } catch { /* An expired/revoked credential cannot resume a messenger session. */ }
}
for (const signal of ['SIGTERM','SIGINT'] as const) process.on(signal, () => { void Promise.all([...[...accounts.values()].map((session) => session.stop(false)),...[...platonusSessions.values()].map(entry=>entry.session.close())]).finally(() => { server.close(); process.exit(0) }) })
