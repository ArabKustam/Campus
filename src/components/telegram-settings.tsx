import { useEffect, useState } from 'react'
import {
  Bot,
  CheckCircle2,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Unplug,
  Users,
} from 'lucide-react'
import { telegramApi, type TelegramIntegrationState, type TelegramTestResult } from '../lib/telegram-api'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { SettingsPanel, SettingRow } from './settings-primitives'

const emptyState: TelegramIntegrationState = {
  connected: false,
  status: 'disconnected',
  bot: null,
  connectedAt: null,
  lastTestedAt: null,
  groups: [],
}

function formatTimestamp(value: string | null) {
  if (!value) return 'Ещё не проверялось'
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export function TelegramSettings() {
  const [state, setState] = useState<TelegramIntegrationState>(emptyState)
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'connect' | 'test' | 'disconnect' | 'group' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<TelegramTestResult | null>(null)

  useEffect(() => {
    let active = true
    telegramApi.getState()
      .then((result) => active && setState(result))
      .catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : 'Backend недоступен'))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [])

  const connect = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy('connect')
    setError(null)
    try {
      const result = await telegramApi.connect(token)
      setState(result)
      setToken('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось подключить Telegram')
    } finally {
      setBusy(null)
    }
  }

  const testConnection = async () => {
    setBusy('test')
    setError(null)
    try {
      const result = await telegramApi.test()
      setTestResult(result)
      setState(await telegramApi.getState())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Проверка не выполнена')
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async () => {
    setBusy('disconnect')
    setError(null)
    try {
      setState(await telegramApi.disconnect())
      setTestResult(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось отключить Telegram')
    } finally {
      setBusy(null)
    }
  }

  const selectGroup = async (chatId: string, selected: boolean) => {
    setBusy('group')
    setError(null)
    try {
      setState(await telegramApi.selectGroup(chatId, selected))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить выбор группы')
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return <div className="grid min-h-40 place-items-center rounded-lg border border-border bg-card"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-5">
      <SettingsPanel title="Telegram" description="Подключение через Telegram Bot API и webhook.">
        {!state.connected ? (
          <>
            <SettingRow label="Состояние подключения">
              <Badge className="border-border bg-muted text-muted-foreground">Не подключено</Badge>
            </SettingRow>
            <form onSubmit={connect} className="px-5 py-4">
              <label htmlFor="telegram-token" className="text-sm font-medium text-foreground">Bot Token</label>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Токен проверяется backend-сервером и не сохраняется в браузере.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  id="telegram-token"
                  name="telegram-bot-token"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="123456789:AA..."
                  className="h-9 min-w-0 flex-1 rounded-md border border-input bg-card px-3 font-mono text-xs text-foreground outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                />
                <Button type="submit" size="sm" disabled={!token.trim() || busy === 'connect'}>
                  {busy === 'connect' ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
                  Проверить и подключить
                </Button>
              </div>
            </form>
          </>
        ) : (
          <div className="px-5 py-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300"><Bot className="size-5" /></div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{state.bot?.name}</p>
                    <Badge className={state.status === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}>
                      {state.status === 'error' ? 'Ошибка подключения' : 'Подключено'}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">@{state.bot?.username}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">Проверено: {formatTimestamp(state.lastTestedAt)}</p>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={testConnection} disabled={busy !== null}>
                  {busy === 'test' ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                  Проверить
                </Button>
                <Button variant="outline" size="sm" onClick={disconnect} disabled={busy !== null} className="text-red-600 hover:text-red-700">
                  {busy === 'disconnect' ? <LoaderCircle className="animate-spin" /> : <Unplug />}
                  Отключить
                </Button>
              </div>
            </div>
            {testResult && (
              <div className="mt-4 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                <CheckCircle2 className="size-4 shrink-0" />
                Webhook отвечает · ожидающих обновлений: {testResult.webhook.pendingUpdates}
              </div>
            )}
          </div>
        )}
      </SettingsPanel>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs leading-5 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>
      )}

      {state.connected && (
        <>
          <SettingsPanel title="Подключение к группам" description="Добавьте бота в нужную Telegram-группу. Новые группы появятся здесь после первого полученного сообщения.">
            <div className="grid gap-3 px-5 py-5 sm:grid-cols-3">
              {[
                ['1', 'Добавьте бота', 'Пригласите бота в университетскую группу.'],
                ['2', 'Разрешите сообщения', 'Отключите Privacy Mode в BotFather, если нужно читать все сообщения.'],
                ['3', 'Выберите группу', 'После первого сообщения включите её обработку ниже.'],
              ].map(([step, title, description]) => (
                <div key={step} className="rounded-lg border border-border bg-muted/35 p-3">
                  <span className="grid size-5 place-items-center rounded-full bg-blue-600 text-[10px] font-semibold text-white">{step}</span>
                  <p className="mt-2 text-xs font-semibold text-foreground">{title}</p>
                  <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </SettingsPanel>

          <SettingsPanel title="Найденные группы" description="Отмеченные группы будут передаваться в обработку. Сообщения остальных групп сохраняются, но не анализируются.">
            {state.groups.length ? (
              <div className="divide-y divide-border">
                {state.groups.map((group) => (
                  <label key={group.chatId} className="flex cursor-pointer items-center gap-3 px-5 py-4 hover:bg-muted/35">
                    <input type="checkbox" checked={group.selected} disabled={busy === 'group'} onChange={(event) => selectGroup(group.chatId, event.target.checked)} className="size-4 rounded border-input accent-blue-600" />
                    <div className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><Users className="size-4" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{group.chatName}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">Chat ID {group.chatId} · сообщение {formatTimestamp(group.lastMessageAt)}</p>
                    </div>
                    <Badge className={group.selected ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300' : 'border-border bg-muted text-muted-foreground'}>{group.selected ? 'Обрабатывается' : 'Не выбрана'}</Badge>
                  </label>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8 text-center">
                <MessageSquareText className="mx-auto size-5 text-muted-foreground" />
                <p className="mt-2 text-xs font-medium text-foreground">Группы пока не найдены</p>
                <p className="mx-auto mt-1 max-w-sm text-[10px] leading-4 text-muted-foreground">После первого сообщения из группы webhook сохранит её здесь автоматически.</p>
              </div>
            )}
          </SettingsPanel>
        </>
      )}
    </div>
  )
}
