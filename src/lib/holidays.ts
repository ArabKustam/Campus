// Официальные праздничные (нерабочие) дни Республики Казахстан — Трудовой кодекс РК, ст. 84–85, Закон «О праздниках в РК».
// Работаем только с ключами дат 'YYYY-MM-DD' и UTC-арифметикой: никаких локальных Date, которые могут сдвинуть день из-за часового пояса.

export type HolidayTheme = {
  /** Баннер дня: градиент, рамка */ banner: string
  /** Акцентный текст (название, иконки) */ text: string
  /** Заголовок колонки недели */ header: string
  /** Мягкая заливка ячеек дня в сетке недели */ cell: string
  /** Фон кнопки дня в полосе выбора дня */ chip: string
  /** Точка-маркер */ dot: string
}

export type HolidayId = 'new-year' | 'christmas' | 'women-day' | 'nauryz' | 'unity' | 'defender' | 'victory' | 'capital' | 'constitution' | 'republic' | 'independence' | 'kurban-ait' | 'decree'

export type Holiday = {
  date: string
  id: HolidayId
  /** Полное название праздника (RU) */ name: string
  /** Короткое название для узких мест (RU) */ short: string
  /** Поздравление (RU) */ greeting: string
  emoji: string
  /** Религиозный праздник — при выпадении на выходной не переносится */ religious: boolean
  /** Перенесённый выходной (праздник выпал на субботу/воскресенье) */ transferred?: true
  /** Дата самого праздника, за который дан перенесённый выходной */ forDate?: string
  /** Что показать в интерфейсе: название или «Выходной за …» (RU) */ label: string
  theme: HolidayTheme
}

const THEMES = {
  winter: {banner:'border-sky-200 bg-gradient-to-br from-sky-100 via-slate-50 to-indigo-100 dark:border-sky-800/70 dark:from-sky-950 dark:via-slate-900 dark:to-indigo-950',text:'text-sky-800 dark:text-sky-200',header:'bg-sky-100 dark:bg-sky-900/45',cell:'bg-sky-100/40 dark:bg-sky-900/15',chip:'bg-sky-100/80 dark:bg-sky-900/35',dot:'bg-sky-500 dark:bg-sky-300'},
  star: {banner:'border-indigo-200 bg-gradient-to-br from-indigo-100 via-white to-amber-100 dark:border-indigo-800/70 dark:from-indigo-950 dark:via-slate-900 dark:to-amber-950/70',text:'text-indigo-800 dark:text-indigo-200',header:'bg-indigo-100 dark:bg-indigo-900/45',cell:'bg-indigo-100/40 dark:bg-indigo-900/15',chip:'bg-indigo-100/80 dark:bg-indigo-900/35',dot:'bg-amber-500 dark:bg-amber-300'},
  tulip: {banner:'border-pink-200 bg-gradient-to-br from-pink-100 via-rose-50 to-fuchsia-100 dark:border-pink-800/70 dark:from-pink-950 dark:via-slate-900 dark:to-fuchsia-950',text:'text-pink-800 dark:text-pink-200',header:'bg-pink-100 dark:bg-pink-900/45',cell:'bg-pink-100/40 dark:bg-pink-900/15',chip:'bg-pink-100/80 dark:bg-pink-900/35',dot:'bg-pink-500 dark:bg-pink-300'},
  nauryz: {banner:'border-emerald-200 bg-gradient-to-br from-emerald-100 via-lime-50 to-amber-100 dark:border-emerald-800/70 dark:from-emerald-950 dark:via-slate-900 dark:to-amber-950/70',text:'text-emerald-800 dark:text-emerald-200',header:'bg-emerald-100 dark:bg-emerald-900/45',cell:'bg-emerald-100/40 dark:bg-emerald-900/15',chip:'bg-emerald-100/80 dark:bg-emerald-900/35',dot:'bg-emerald-500 dark:bg-emerald-300'},
  unity: {banner:'border-orange-200 bg-gradient-to-br from-orange-100 via-amber-50 to-yellow-100 dark:border-orange-800/70 dark:from-orange-950 dark:via-slate-900 dark:to-yellow-950/70',text:'text-orange-800 dark:text-orange-200',header:'bg-orange-100 dark:bg-orange-900/45',cell:'bg-orange-100/40 dark:bg-orange-900/15',chip:'bg-orange-100/80 dark:bg-orange-900/35',dot:'bg-orange-500 dark:bg-orange-300'},
  defender: {banner:'border-teal-200 bg-gradient-to-br from-teal-100 via-stone-50 to-lime-100 dark:border-teal-800/70 dark:from-teal-950 dark:via-slate-900 dark:to-lime-950/70',text:'text-teal-800 dark:text-teal-200',header:'bg-teal-100 dark:bg-teal-900/45',cell:'bg-teal-100/40 dark:bg-teal-900/15',chip:'bg-teal-100/80 dark:bg-teal-900/35',dot:'bg-teal-600 dark:bg-teal-300'},
  victory: {banner:'border-orange-300 bg-gradient-to-br from-orange-100 via-stone-50 to-red-100 dark:border-orange-800/70 dark:from-orange-950 dark:via-stone-900 dark:to-red-950',text:'text-orange-900 dark:text-orange-200',header:'bg-orange-100 dark:bg-orange-900/45',cell:'bg-orange-100/40 dark:bg-orange-900/15',chip:'bg-orange-100/80 dark:bg-orange-900/35',dot:'bg-orange-600 dark:bg-orange-300'},
  capital: {banner:'border-cyan-200 bg-gradient-to-br from-cyan-100 via-sky-50 to-amber-100 dark:border-cyan-800/70 dark:from-cyan-950 dark:via-slate-900 dark:to-amber-950/70',text:'text-cyan-800 dark:text-cyan-200',header:'bg-cyan-100 dark:bg-cyan-900/45',cell:'bg-cyan-100/40 dark:bg-cyan-900/15',chip:'bg-cyan-100/80 dark:bg-cyan-900/35',dot:'bg-cyan-500 dark:bg-cyan-300'},
  constitution: {banner:'border-amber-200 bg-gradient-to-br from-amber-100 via-stone-50 to-sky-100 dark:border-amber-800/70 dark:from-amber-950 dark:via-stone-900 dark:to-sky-950',text:'text-amber-900 dark:text-amber-200',header:'bg-amber-100 dark:bg-amber-900/40',cell:'bg-amber-100/40 dark:bg-amber-900/15',chip:'bg-amber-100/80 dark:bg-amber-900/30',dot:'bg-amber-500 dark:bg-amber-300'},
  flag: {banner:'border-sky-300 bg-gradient-to-br from-sky-200 via-sky-50 to-amber-100 dark:border-sky-700/70 dark:from-sky-900 dark:via-slate-900 dark:to-amber-950/80',text:'text-sky-800 dark:text-sky-200',header:'bg-sky-200/80 dark:bg-sky-800/50',cell:'bg-sky-100/50 dark:bg-sky-900/20',chip:'bg-sky-100 dark:bg-sky-900/45',dot:'bg-amber-400 dark:bg-amber-300'},
  crescent: {banner:'border-emerald-200 bg-gradient-to-br from-emerald-100 via-teal-50 to-amber-50 dark:border-emerald-800/70 dark:from-emerald-950 dark:via-slate-900 dark:to-teal-950',text:'text-emerald-800 dark:text-emerald-200',header:'bg-emerald-100 dark:bg-emerald-900/45',cell:'bg-emerald-100/40 dark:bg-emerald-900/15',chip:'bg-emerald-100/80 dark:bg-emerald-900/35',dot:'bg-emerald-600 dark:bg-emerald-300'},
  decree: {banner:'border-slate-200 bg-gradient-to-br from-slate-100 via-white to-sky-50 dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-sky-950',text:'text-slate-800 dark:text-slate-200',header:'bg-slate-100 dark:bg-slate-800/60',cell:'bg-slate-100/50 dark:bg-slate-800/25',chip:'bg-slate-100 dark:bg-slate-800/50',dot:'bg-slate-500 dark:bg-slate-300'},
} satisfies Record<string, HolidayTheme>

type Definition = Omit<Holiday, 'date' | 'label' | 'transferred' | 'forDate'>
const def = (id: HolidayId, name: string, short: string, greeting: string, emoji: string, theme: HolidayTheme, religious = false): Definition => ({id, name, short, greeting, emoji, theme, religious})

const NEW_YEAR = def('new-year', 'Новый год', 'Новый год', 'С Новым годом!', '🎄', THEMES.winter)
/** Фиксированные праздники: [месяц, день, описание] */
const FIXED: [number, number, Definition][] = [
  [1, 1, NEW_YEAR], [1, 2, NEW_YEAR],
  [1, 7, def('christmas', 'Православное Рождество', 'Рождество', 'Со светлым Рождеством!', '⭐', THEMES.star, true)],
  [3, 8, def('women-day', 'Международный женский день', '8 Марта', 'С 8 Марта — весны и вдохновения!', '🌷', THEMES.tulip)],
  ...[21, 22, 23].map((day): [number, number, Definition] => [3, day, def('nauryz', 'Наурыз мейрамы', 'Наурыз', 'Наурыз құтты болсын!', '🌸', THEMES.nauryz)]),
  [5, 1, def('unity', 'Праздник единства народа Казахстана', 'День единства', 'С Днём единства народа Казахстана!', '🤝', THEMES.unity)],
  [5, 7, def('defender', 'День защитника Отечества', 'День защитника', 'С Днём защитника Отечества!', '🎖️', THEMES.defender)],
  [5, 9, def('victory', 'День Победы', 'День Победы', 'С Днём Победы! Помним.', '🕊️', THEMES.victory)],
  [7, 6, def('capital', 'День столицы', 'День столицы', 'С Днём столицы!', '🏙️', THEMES.capital)],
  [8, 30, def('constitution', 'День Конституции', 'День Конституции', 'С Днём Конституции!', '📜', THEMES.constitution)],
  [10, 25, def('republic', 'День Республики', 'День Республики', 'С Днём Республики!', '🇰🇿', THEMES.flag)],
  [12, 16, def('independence', 'День независимости', 'День независимости', 'С Днём независимости!', '🇰🇿', THEMES.flag)],
]

const KURBAN_AIT = def('kurban-ait', 'Курбан айт', 'Курбан айт', 'Курбан айт мерекесі құтты болсын!', '🌙', THEMES.crescent, true)
/** Первый день Курбан айта — по лунному календарю, дату ежегодно утверждает ДУМК. Годы вне списка считаются неизвестными. */
export const KURBAN_AIT_DATES: Record<number, string> = {2025: '2025-06-06', 2026: '2026-05-27', 2027: '2027-05-16', 2028: '2028-05-05'}

/**
 * Дополнительные переносы выходных по ежегодным постановлениям Правительства РК (например, «мост» между праздником и выходными).
 * Их нельзя вычислить заранее — заполнять вручную после выхода постановления: {'YYYY-MM-DD': 'причина'}.
 * Пока пусто: постановления на 2026–2027 гг. в проекте не подтверждены.
 */
export const KNOWN_TRANSFERS: Record<string, string> = {}

const DAY_MS = 86_400_000
const toUtc = (key: string) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const pad = (value: number) => String(value).padStart(2, '0')
/** 0 = воскресенье … 6 = суббота */
export const weekdayOfKey = (key: string) => new Date(toUtc(key)).getUTCDay()
export const addDaysToKey = (key: string, days: number) => fromUtc(toUtc(key) + days * DAY_MS)
const isWeekend = (key: string) => { const day = weekdayOfKey(key); return day === 0 || day === 6 }

/** Известна ли для года дата Курбан айта (без неё список праздников года неполный). */
export const holidayCoverage = (year: number) => ({kurbanAit: year in KURBAN_AIT_DATES})

const cache = new Map<number, Map<string, Holiday>>()
function yearHolidays(year: number): Map<string, Holiday> {
  const hit = cache.get(year); if (hit) return hit
  const result = new Map<string, Holiday>()
  const own: Holiday[] = FIXED.map(([m, d, item]) => ({...item, date: `${year}-${pad(m)}-${pad(d)}`, label: item.name}))
  const kurban = KURBAN_AIT_DATES[year]; if (kurban) own.push({...KURBAN_AIT, date: kurban, label: KURBAN_AIT.name})
  own.sort((a, b) => a.date.localeCompare(b.date)).forEach(item => result.set(item.date, item))
  for (const [date, reason] of Object.entries(KNOWN_TRANSFERS)) if (date.startsWith(`${year}-`) && !result.has(date)) result.set(date, {...def('decree', reason, 'Выходной', 'Хорошего отдыха!', '📅', THEMES.decree), date, label: reason, transferred: true})
  // Ст. 85 ТК РК: светский праздник в субботу/воскресенье → выходной переносится на следующий рабочий день (не выходной, не праздник, не другой перенос).
  for (const item of own) {
    if (item.religious || !isWeekend(item.date)) continue
    let next = addDaysToKey(item.date, 1)
    while (isWeekend(next) || result.has(next)) next = addDaysToKey(next, 1)
    result.set(next, {...item, date: next, transferred: true, forDate: item.date, label: `Выходной за ${item.name}`})
  }
  cache.set(year, result)
  return result
}

/** Праздник или перенесённый выходной на дату 'YYYY-MM-DD', иначе null. */
export function holidayOn(dateKey: string): Holiday | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null
  const year = Number(dateKey.slice(0, 4))
  // Перенос за 16 декабря может уйти в следующий год только теоретически — проверяем и предыдущий год.
  return yearHolidays(year).get(dateKey) ?? (dateKey.slice(5) < '01-10' ? yearHolidays(year - 1).get(dateKey) ?? null : null)
}

/** Все праздничные/перенесённые дни в интервале [from; to] включительно, по возрастанию даты. */
export function holidaysInRange(from: string, to: string): Holiday[] {
  const result: Holiday[] = []
  for (let key = from, guard = 0; key <= to && guard < 3700; key = addDaysToKey(key, 1), guard++) { const item = holidayOn(key); if (item) result.push(item) }
  return result
}
