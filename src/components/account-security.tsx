import {t,useLanguage} from '../lib/language'
import { useState } from 'react'
import { requestApi } from '../lib/api-client'
import { Button } from './ui/button'
export function AccountSecurity() {
 useLanguage();
  const [error, setError] = useState(''), [notice,setNotice] = useState(''), [busy,setBusy] = useState(false)
  async function change(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    const form = event.currentTarget
    try { await requestApi('/api/auth/password', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); form.reset(); setNotice('Пароль изменён. Остальные сеансы сайта завершены.') }
    catch (e) { setError(e instanceof Error ? e.message : t("Ошибка сохранения")) } finally { setBusy(false) }
  }
  return <section className="space-y-4 rounded-lg border bg-card p-4"><h2 className="font-semibold">Безопасность аккаунта</h2><p className="text-sm text-muted-foreground">Данные изолированы от других аккаунтов сайта. Личные сессии Telegram и WhatsApp хранятся в коннекторе на вашем устройстве. Текст выбранных сообщений передаётся Cloudflare Workers AI для обработки.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm">{notice}</p>}
    <form className="space-y-3" onSubmit={change}><label className="block text-sm">Текущий пароль<input type="password" name="currentPassword" required autoComplete="current-password" className="mt-1 w-full rounded-md border bg-background px-3 py-2" /></label><label className="block text-sm">Новый пароль<input type="password" name="password" required minLength={4} maxLength={256} autoComplete="new-password" className="mt-1 w-full rounded-md border bg-background px-3 py-2" /></label><Button type="submit" disabled={busy}>Изменить пароль</Button></form>
    <div className="border-t pt-4"><p className="mb-3 text-sm text-muted-foreground">Отзыв ключей остановит передачу сообщений со всех ваших коннекторов. Для возобновления потребуется повторное подключение.</p><Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { await requestApi('/api/auth/connector-token', { method: 'DELETE' }); setNotice('Все ключи коннекторов отозваны.') } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка отзыва') } finally { setBusy(false) } }}>Отозвать подключения устройств</Button></div>
  </section>
}
