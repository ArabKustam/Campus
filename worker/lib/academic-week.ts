export type WeekType = 'odd' | 'even'

type AcademicPeriod = {
  semesterStart: string
  semesterEnd: string
  anchorWeekDate: string
  anchorWeekType: WeekType
}

const defaultPeriod: AcademicPeriod = {
  semesterStart: '2026-09-01',
  semesterEnd: '2026-12-12',
  anchorWeekDate: '2026-09-01',
  anchorWeekType: 'odd',
}

function utcDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`)
}

function monday(date: Date) {
  const copy = new Date(date)
  const day = copy.getUTCDay() || 7
  copy.setUTCDate(copy.getUTCDate() - day + 1)
  return copy
}

export async function getAcademicWeek(db: D1Database, dateKey: string) {
  const setting = await db.prepare("SELECT value_json FROM settings WHERE key = 'academic_period'").first<{ value_json: string }>()
  const period = setting ? { ...defaultPeriod, ...JSON.parse(setting.value_json) as Partial<AcademicPeriod> } : defaultPeriod
  const date = utcDate(dateKey)
  const anchor = monday(utcDate(period.anchorWeekDate))
  const selected = monday(date)
  const distance = Math.round((selected.getTime() - anchor.getTime()) / 604_800_000)
  const type = Math.abs(distance) % 2 === 0 ? period.anchorWeekType : period.anchorWeekType === 'odd' ? 'even' : 'odd'
  return {
    type,
    weekNumber: distance + 1,
    inPeriod: dateKey >= period.semesterStart && dateKey <= period.semesterEnd,
    weekday: date.getUTCDay() || 7,
  }
}
