import {t,useLanguage} from '../lib/language'
import { useEffect, useState } from 'react'
import { requestApi } from '../lib/api-client'
import { Button } from './ui/button'
import { LoadingState } from './ui/page-state'
import { useAccount } from './auth-gate'
type Provider = 'telegram' | 'whatsapp'
type State = { status: string; desired: string; error: string | null; lastSyncAt: string | null; groups: { id: string; name: string; avatar?:string|null; selected: number }[] }
type LocalState = { status: string; qr: string | null; error: string | null; needsPassword?: boolean; imported?: number; phase?:string; version?:number; analysis?:{status:string;messages:number;actions:number;error:string|null} }
const localOrigin = 'http://127.0.0.1:3987'
export function PersonalSettings({ provider }: { provider: Provider }) {
 useLanguage();
  const { user } = useAccount()
  const [state, setState] = useState<State | null>(null), [local, setLocal] = useState<LocalState | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [apiId, setApiId] = useState(''), [apiHash, setApiHash] = useState(''), [password, setPassword] = useState(''), [search,setSearch]=useState('')
  const key = `campus-local-${user.id}-${provider}`
  const [localToken, setLocalToken] = useState(() => sessionStorage.getItem(key) ?? '')
  async function callLocal(path: string, body?: unknown, token = localToken) {
    const response = await fetch(`${localOrigin}${path}`, { signal: AbortSignal.timeout(10000), method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', 'x-campus-local': '1', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const result = await response.json()
    if (!response.ok) throw new Error(response.status===404?'Обновите коннектор: скачайте новый архив, замените файлы без удаления .data и перезапустите npm start.':result.error || 'Ошибка локального подключения')
    return result
  }
  async function refresh() {
    setState(await requestApi<State>(`/api/personal/${provider}`))
    if (localToken) setLocal(await callLocal('/state'))
  }
  useEffect(() => {
    let active = true
    const poll = async () => { try { const result = await requestApi<State>(`/api/personal/${provider}`); if (active) setState(result); if (localToken) { const status = await callLocal('/state'); if (active) setLocal(status) } } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Нет связи') } }
    void poll(); const timer = window.setInterval(() => void poll(), 3000)
    return () => { active = false; clearInterval(timer) }
  }, [provider, localToken])
  async function connect() {
    setBusy(true); setError('')
    try {
      await callLocal('/health', undefined, '')
      const { token } = await requestApi<{ token: string }>('/api/auth/connector-token', { method: 'POST' })
      await requestApi(`/api/personal/${provider}/connect`, { method: 'POST' })
      const result = await callLocal('/link', { token, provider, apiId: apiId ? Number(apiId) : undefined, apiHash: apiHash || undefined }, '')
      setLocalToken(result.localToken); sessionStorage.setItem(key, result.localToken); setApiHash(''); setApiId('')
      await refresh()
    } catch (e) { setError(e instanceof TypeError || (e instanceof Error && ['TimeoutError', 'AbortError'].includes(e.name)) ? 'Нет связи с локальным коннектором. Запустите его и разрешите этому сайту доступ к локальной сети в браузере.' : e instanceof Error ? e.message : 'Не удалось подключить') } finally { setBusy(false) }
  }
  async function analyze(){
    setBusy(true);setError('')
    try{
      let token=localToken
      if(!token){const remote=await requestApi<{token:string}>('/api/auth/connector-token',{method:'POST'});const result=await callLocal('/resume',{token:remote.token,provider},'');token=result.localToken;setLocalToken(token);sessionStorage.setItem(key,token)}
      setLocal(await callLocal('/analyze',{},token))
    }catch(e){setError(e instanceof Error?e.message:'Не удалось запустить анализ')}finally{setBusy(false)}
  }
  async function disconnect() {
    setBusy(true); setError('')
    try {
      await requestApi(`/api/personal/${provider}`, { method: 'DELETE' })
      if (localToken) await callLocal('/disconnect', {}).catch(() => {})
      sessionStorage.removeItem(key); setLocalToken(''); setLocal(null); await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка отключения') } finally { setBusy(false) }
  }
  const name = provider === 'telegram' ? 'Telegram' : 'WhatsApp'
  return <section className="space-y-4"><h2 className="text-base font-semibold">Личный {name}</h2>
    <p className="text-sm text-muted-foreground">QR-вход через локальный коннектор на вашем компьютере. Сайт получает сообщения только из выбранных ниже чатов, начиная с 30 августа 2026. Сессия мессенджера остаётся на устройстве.</p>
    <details className="rounded-lg border bg-card p-3 text-sm"><summary className="cursor-pointer font-medium">{t("Как запустить коннектор (для продвинутых)")}</summary><p className="mt-2"><a href="/downloads/campus-connector.zip" download className="underline text-primary">Скачайте коннектор</a>, распакуйте архив, выполните в его папке <code>npm ci</code> и <code>npm start</code>. Если вы запускаете из исходного проекта, выполните <code className="break-all">npm run connector</code>. При обновлении остановите старый процесс, замените файлы из архива, сохранив папку <code>.data</code>, затем снова выполните <code>npm ci</code> и <code>npm start</code>. Для облачного сайта задайте <code>CAMPUS_APP_URL</code> равным адресу этого сайта. Коннектор должен работать, пока нужна синхронизация. История WhatsApp ограничена тем, что мессенджер передаст связанному устройству.</p></details>
    {!state && !error && <LoadingState />}
    {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
    {(local?.error || state?.error) && <p role="alert" className="break-words text-sm text-destructive">{local?.error || state?.error}</p>}
    <p className="text-sm">{local?.phase|| (state?.status === 'connected' ? 'Аккаунт подключён' : state?.status === 'pairing' ? 'Ожидание QR-входа' : 'Аккаунт не подключён')}{local?.imported ? ` · Принято сообщений: ${local.imported}` : ''}</p>
    {provider === 'telegram' && state?.status !== 'connected' && <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Telegram API ID<input type="number" value={apiId} onChange={(e) => setApiId(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2" /></label><label className="text-sm">Telegram API Hash<input type="password" autoComplete="off" value={apiHash} onChange={(e) => setApiHash(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2" /></label><p className="text-xs text-muted-foreground sm:col-span-2">Получите реквизиты своего приложения на <a href="https://my.telegram.org/apps" target="_blank" rel="noreferrer" className="underline">my.telegram.org/apps</a>. Они передаются только локальному коннектору.</p></div>}
    {provider === 'telegram' && state?.status !== 'connected' && <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground"><li>Откройте my.telegram.org/apps, войдите по номеру Telegram и выберите «API development tools».</li><li>Создайте приложение (если его ещё нет), скопируйте <strong>api_id</strong> и <strong>api_hash</strong> в поля выше. Это не токен бота.</li><li>Нажмите «Показать QR». На телефоне откройте Telegram → Настройки → Устройства → Подключить устройство и отсканируйте код.</li><li>При запросе введите облачный пароль Telegram. Затем выберите нужные группы в разделе «Чаты для чтения».</li></ol>}
    {provider === 'whatsapp' && state?.status !== 'connected' && <p className="text-sm text-muted-foreground">На телефоне: WhatsApp → Настройки (или ⋮) → Связанные устройства → Привязка устройства. Отсканируйте QR ниже, затем выберите группы для чтения.</p>}
    {local?.qr && <div className="w-fit rounded-lg border bg-white p-3"><img src={local.qr} alt={`QR-код входа в ${name}`} width={240} height={240} /></div>}
    {local?.needsPassword && <form onSubmit={(e) => { e.preventDefault(); void callLocal('/password', { password }).then(() => setPassword('')).catch((e) => setError(e.message)) }} className="flex flex-wrap gap-2"><label className="text-sm">Облачный пароль Telegram<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" className="mt-1 w-full rounded-md border bg-background px-3 py-2" /></label><Button type="submit">{t("Подтвердить")}</Button></form>}
    <div className="flex flex-wrap gap-2"><Button disabled={busy || (provider === 'telegram' && (!apiId || !apiHash))} onClick={() => void connect()}>Показать QR</Button><Button variant="outline" disabled={busy} onClick={() => void disconnect()}>Отключить</Button></div>
    {state?.status==='connected'&&<div className="space-y-2 rounded-lg border p-3"><Button disabled={busy||['syncing','analyzing'].includes(local?.analysis?.status??'')} onClick={()=>void analyze()}>Синхронизировать и анализировать сейчас</Button><p className="text-xs text-muted-foreground">Забрать новые сообщения выбранных чатов и сразу запустить AI, не ожидая таймера. Анализируются пакеты до 20 сообщений с контекстом; уже обработанные повторно не применяются.</p>{local?.analysis&&local.analysis.status!=='idle'&&<p role="status" className="text-sm">{({syncing:'Получаем новые сообщения…',analyzing:'AI анализирует…',completed:'Анализ завершён',failed:'Анализ остановлен'})[local.analysis.status as 'syncing']} · Сообщений: {local.analysis.messages} · Решений: {local.analysis.actions}</p>}{local?.analysis?.error&&<p role="alert" className="text-sm text-destructive">{local.analysis.error}</p>}{local&&local.version!==2&&<p className="text-sm text-muted-foreground">Для запуска кнопкой скачайте обновлённый коннектор и перезапустите его.</p>}</div>}
    {provider==='whatsapp'&&<p className="text-xs text-muted-foreground">В связанных устройствах может отображаться Chrome (macOS): это браузер локального коннектора на вашем компьютере, а не сервер сайта.</p>}
    <label className="block text-sm">Поиск группы<input value={search} onChange={e=>setSearch(e.target.value)} className="mt-1 w-full rounded-md border bg-background p-2"/></label>
    <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Чаты для чтения</legend>{!state?.groups.length && <p className="text-sm text-muted-foreground">После входа здесь появятся группы. До выбора чата сообщения не передаются.</p>}{state?.groups.filter(group=>group.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((group) => <label key={group.id} className="flex items-start gap-3 rounded-lg border bg-card p-3 text-sm"><input type="checkbox" className="mt-0.5" checked={Boolean(group.selected)} onChange={(e) => { void requestApi<State>(`/api/personal/${provider}/groups/${encodeURIComponent(group.id)}`, { method: 'PUT', body: JSON.stringify({ selected: e.target.checked }) }).then(setState).catch((e) => setError(e.message)) }} /><GroupAvatar image={group.avatar} name={group.name}/><span className="min-w-0 break-words">{group.name}</span></label>)}</fieldset>
  </section>
}

function GroupAvatar({image,name}:{image?:string|null;name:string}){
 useLanguage();
 const [failed,setFailed]=useState(false)
 return image&&!failed?<img src={image} alt="" className="size-10 shrink-0 rounded-full object-cover" onError={()=>setFailed(true)}/>:<span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-muted font-medium">{name.slice(0,2).toUpperCase()}</span>
}
