import {t,useLanguage,LanguageSelect} from '../lib/language'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { requestApi } from '../lib/api-client'
import { Button } from './ui/button'
import { LoadingState } from './ui/page-state'
export type Account = { id: string; login: string; displayName: string; isAdmin?: boolean; features?: string[] }
const AccountContext = createContext<{ user: Account; logout: () => Promise<void> } | null>(null)
export function useAccount() { return useContext(AccountContext)! }
export function AuthGate({ children }: { children: ReactNode }) {
 useLanguage();
  const channel = useRef<BroadcastChannel | null>(null)
  const [user, setUser] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)
  const [register, setRegister] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    channel.current = new BroadcastChannel('campus-account')
    channel.current.onmessage = () => {
      setUser(null)
      for (const key of Object.keys(sessionStorage)) if (key.startsWith('campus-local-')) sessionStorage.removeItem(key)
      void requestApi<Account>('/api/auth/me').then((value) => { if (active) setUser(value) }).catch(() => {})
    }
    const expired = () => { setUser(null); channel.current?.postMessage('changed') }
    window.addEventListener('campus-auth-expired', expired)
    requestApi<Account>('/api/auth/me').then((value) => { if (active) setUser(value) }).catch((reason) => { if (active && reason.status !== 401) setError(reason.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; window.removeEventListener('campus-auth-expired', expired); channel.current?.close() }
  }, [])
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    const fields = new FormData(event.currentTarget)
    try { setUser(await requestApi<Account>(`/api/auth/${register ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify(Object.fromEntries(fields)) })); channel.current?.postMessage('changed') }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("Не удалось войти")) }
    finally { setBusy(false) }
  }
  async function logout() { await requestApi('/api/auth/logout', { method: 'POST' }); for (const key of Object.keys(sessionStorage)) if (key.startsWith('campus-local-')) sessionStorage.removeItem(key); setUser(null); channel.current?.postMessage('changed') }
  if (loading) return <LoadingState label={t("Проверяем аккаунт…")} />
  if (user) return <AccountContext.Provider key={user.id} value={{ user, logout }}>{children}</AccountContext.Provider>
  return <main className="grid min-h-screen place-items-center bg-background p-4 text-foreground"><form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6">
    <div className="flex items-center justify-between gap-3"><img src="/campus.svg" alt="Campus" className="size-11"/><LanguageSelect/></div><h1 className="text-xl font-semibold">{register ? t("Создать аккаунт Campus") : t("Войти в Campus")}</h1>
    <p className="text-sm text-muted-foreground">{t("Личное расписание, оценки и учебные материалы.")}</p>
    <label className="block text-sm">{t("Логин")}<input name="login" required minLength={3} maxLength={60} pattern="[a-zA-Z0-9_.\-]+" autoCapitalize="none" autoComplete="username" aria-describedby="login-hint" className="mt-1 w-full rounded-md border bg-background px-3 py-2" /></label>
    <p id="login-hint" className="text-xs text-muted-foreground">{t("Латинские буквы, цифры, точка, дефис или подчёркивание.")}</p>
    <label className="block text-sm">{t("Пароль")}<input name="password" type="password" required minLength={4} maxLength={256} autoComplete={register ? 'new-password' : 'current-password'} className="mt-1 w-full rounded-md border bg-background px-3 py-2" /></label>
    {register && <p className="text-xs text-muted-foreground">{t("Минимум 4 символа. Лучше использовать длинный уникальный пароль.")}</p>}
    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
    {register&&<p className="text-xs text-muted-foreground">Campus сохраняет историю входов, посещённые разделы, тип устройства и открытия документов на 90 дней. Эти сведения доступны только администратору.</p>}
    <Button type="submit" disabled={busy} className="w-full">{busy ? t("Подождите…") : register ? t("Создать аккаунт") : t("Войти")}</Button>
    <button type="button" onClick={() => { setRegister(!register); setError('') }} className="w-full text-sm text-primary">{register ? t("Уже есть аккаунт — войти") : t("Создать аккаунт")}</button>
  </form></main>
}
