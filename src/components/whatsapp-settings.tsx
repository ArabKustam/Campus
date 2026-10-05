import {t,useLanguage} from '../lib/language'
import { useEffect, useState } from 'react'
import { CheckCircle2, LoaderCircle, QrCode, ShieldCheck, Smartphone, Unplug, Users } from 'lucide-react'
import { whatsappApi, type WhatsAppIntegrationState } from '../lib/whatsapp-api'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { SettingsPanel, SettingRow } from './settings-primitives'

const disconnectedState: WhatsAppIntegrationState = {
  status: 'disconnected',
  connected: false,
  qrDataUrl: null,
  lastSyncAt: null,
  groups: [],
  bridgeMode: 'external',
}

function formatTimestamp(value: string | null) {
  if (!value) return 'Синхронизации ещё не было'
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export function WhatsAppSettings() {
 useLanguage();
  const [state, setState] = useState<WhatsAppIntegrationState>(disconnectedState)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    whatsappApi.getState()
      .then((result) => active && setState(result))
      .catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : 'Backend недоступен'))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (state.status !== 'pairing') return
    const timer = window.setInterval(() => {
      whatsappApi.getState().then(setState).catch(() => undefined)
    }, 1_000)
    return () => window.clearInterval(timer)
  }, [state.status])

  const connect = async () => {
    setBusy(true)
    setError(null)
    try {
      setState(await whatsappApi.connect())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось создать QR')
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    setError(null)
    try {
      setState(await whatsappApi.disconnect())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось отключить WhatsApp')
    } finally {
      setBusy(false)
    }
  }

  const selectGroup = async (groupId: string) => {
    setBusy(true)
    setError(null)
    try {
      setState(await whatsappApi.selectGroup(groupId))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось выбрать группу')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="grid min-h-40 place-items-center rounded-lg border border-border bg-card"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3 dark:border-blue-900 dark:bg-blue-950/25">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-300" />
          <div>
            <p className="text-xs font-semibold text-foreground">Подключение личного аккаунта через отдельный bridge</p>
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">Официальный WhatsApp Cloud API не предоставляет чтение обычных личных групп. Campus получает разрешённые групповые сообщения от отдельного WhatsApp Bridge — он не запускается внутри Cloudflare Worker.</p>
          </div>
        </div>
      </div>

      <SettingsPanel title="WhatsApp" description="Состояние внешнего bridge и привязка устройства.">
        {state.status === 'disconnected' && (
          <>
            <SettingRow label={t("Статус")}><Badge className="border-border bg-muted text-muted-foreground">Не подключён</Badge></SettingRow>
            <div className="px-5 py-4">
              <Button onClick={connect} disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Smartphone />}Подключить WhatsApp</Button>
              <p className="mt-2 text-[10px] leading-4 text-muted-foreground">Backend запросит одноразовый pairing QR у внешнего bridge.</p>
            </div>
          </>
        )}

        {state.status === 'pairing' && (
          <div className="grid gap-6 px-5 py-5 sm:grid-cols-[240px_minmax(0,1fr)] sm:items-center">
            <div className="rounded-lg border border-border bg-white p-3 shadow-subtle">
              {state.qrDataUrl ? <img src={state.qrDataUrl} alt="QR-код для привязки WhatsApp" className="aspect-square w-full" /> : <div className="grid aspect-square place-items-center"><QrCode className="size-8 text-muted-foreground" /></div>}
            </div>
            <div>
              <div className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin text-blue-600" /><p className="text-sm font-semibold text-foreground">Ожидаем сканирование</p></div>
              <ol className="mt-4 space-y-3 text-xs text-foreground">
                {['Откройте WhatsApp', 'Перейдите в «Связанные устройства»', 'Нажмите «Привязать устройство»', 'Отсканируйте QR-код'].map((step, index) => (
                  <li key={step} className="flex gap-2.5"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">{index + 1}</span><span className="pt-0.5">{step}</span></li>
                ))}
              </ol>
              <p className="mt-4 text-[10px] leading-4 text-muted-foreground">QR поступил через backend. В mock-режиме подключение подтверждается автоматически.</p>
            </div>
          </div>
        )}

        {state.status === 'connected' && (
          <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300"><CheckCircle2 className="size-5" /></div>
              <div>
                <div className="flex items-center gap-2"><p className="text-sm font-semibold text-foreground">{t("Статус")}</p><Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Подключён</Badge></div>
                <p className="mt-1 text-[10px] text-muted-foreground">Последняя синхронизация: {formatTimestamp(state.lastSyncAt)}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={disconnect} disabled={busy} className="text-red-600 hover:text-red-700">{busy ? <LoaderCircle className="animate-spin" /> : <Unplug />}Отключить</Button>
          </div>
        )}
      </SettingsPanel>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

      {state.status === 'connected' && (
        <SettingsPanel title="Доступные группы" description="Bridge отправляет backend только сообщения выбранной группы. Личные чаты и остальные группы не передаются.">
          {state.groups.length ? (
            <div className="divide-y divide-border">
              {state.groups.map((group) => (
                <label key={group.id} className="flex cursor-pointer items-center gap-3 px-5 py-4 hover:bg-muted/35">
                  <input type="radio" name="whatsapp-source-group" checked={group.selected} disabled={busy} onChange={() => selectGroup(group.id)} className="size-4 accent-emerald-600" />
                  <div className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><Users className="size-4" /></div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">{group.name}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{group.id}</p></div>
                  <Badge className={group.selected ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-border bg-muted text-muted-foreground'}>{group.selected ? 'Читается' : 'Не выбрана'}</Badge>
                </label>
              ))}
            </div>
          ) : (
            <div className="px-5 py-8 text-center"><Users className="mx-auto size-5 text-muted-foreground" /><p className="mt-2 text-xs font-medium text-foreground">Группы не найдены</p></div>
          )}
        </SettingsPanel>
      )}
    </div>
  )
}
