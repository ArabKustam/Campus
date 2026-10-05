import { isInMessageWindow, MESSAGE_HISTORY_START } from '../lib/message-window'
import { getAcademicWeek } from '../lib/academic-week'

type MessageRow = {
  id: string
  source_id: string
  external_message_id: string
  sender_json: string
  text: string | null
  sent_at: string
  reply_to_json: string | null
  provider: 'telegram' | 'whatsapp' | 'manual'
}

export type ContextMessage = {
  id: string
  externalMessageId: string
  sender: Record<string, unknown>
  text: string
  sentAt: string
}

type ReplyContextMessage = Omit<ContextMessage, 'id' | 'sentAt'> & { id: string | null; sentAt: string | null }

export type ContextLesson = {
  scheduleSlotId: string
  date: string
  originalDate: string
  subjectId: string
  subjectName: string
  teacherId: string | null
  teacherName: string | null
  slotNumber: number
  startTime: string
  endTime: string
  status: string
  room: string | null
}

export type SubjectCandidate = {
  subjectId: string
  subjectName: string
  priority: number
  evidence: 'explicit_subject' | 'explicit_teacher' | 'explicit_date' | 'reply_context' | 'neighbor_message' | 'active_lesson' | 'nearest_lesson'
}

export type ProcessingMessageContext = {
  chat?: {id:string;name:string;provider:string}
  currentMessage: ContextMessage
  messageDate: string
  messageTime: string
  weekday: number
  weekType: 'odd' | 'even'
  dayLessons: ContextLesson[]
  activeLesson: ContextLesson | null
  previousLesson: ContextLesson | null
  nextLesson: ContextLesson | null
  referencedLessons: ContextLesson[]
  conversationDates: { messageId: string | null; dates: string[] }[]
  referencedDates: string[]
  subjectCandidates: SubjectCandidate[]
  nextLessonDatesBySubject: Record<string, string[]>
  nextLessonsBySubject: Record<string, ContextLesson[]>
  conversation: {
    previous: ContextMessage[]
    current: ContextMessage
    next: ContextMessage[]
    replyChain: ReplyContextMessage[]
  }
}

type SubjectRow = { id: string; name: string; short_name: string | null }
type LessonRow = {
  schedule_slot_id: string
  original_date: string | null
  subject_id: string
  subject_name: string
  teacher_id: string | null
  teacher_name: string | null
  slot_number: number
  start_time: string
  end_time: string
  status: string
  room: string | null
}

const stopWords = new Set(['основы', 'занятие', 'практикум', 'безопасности', 'информационной', 'средств'])

function normalize(value: string) {
  return value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

type PersonMap = Map<string, Record<string, unknown>>
function toContextMessage(row: MessageRow, people: PersonMap = new Map()): ContextMessage {
  const sender = JSON.parse(row.sender_json) as Record<string, unknown>
  const person = people.get(`${row.provider}:${sender.id}`)
  return {
    id: row.id,
    externalMessageId: row.external_message_id,
    sender: { ...sender, ...(person ?? {}), trusted: person?.trusted === 1 },
    text: row.text ?? '',
    sentAt: row.sent_at,
  }
}

export function localDateTime(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return { date: `${value.year}-${value.month}-${value.day}`, time: `${value.hour}:${value.minute}` }
}

export function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function weekday(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay() || 7
}

export async function dayLessons(db: D1Database, date: string, type: 'odd' | 'even') {
  const result = await db.prepare(`
    SELECT ss.id AS schedule_slot_id, lo.lesson_date AS original_date, s.id AS subject_id, s.name AS subject_name,
      t.id AS teacher_id, t.name AS teacher_name, ss.slot_number,
      COALESCE(lo.moved_start_time, ss.start_time) AS start_time,
      COALESCE(lo.moved_end_time, ss.end_time) AS end_time,
      COALESCE(lo.status, 'normal') AS status, COALESCE(lo.room, ss.room) AS room
    FROM schedule_slots ss
    JOIN subjects s ON s.id = ss.subject_id
    LEFT JOIN teachers t ON t.id = ss.teacher_id
    LEFT JOIN lesson_overrides lo ON lo.schedule_slot_id = ss.id AND (lo.lesson_date = ? OR (lo.status = 'moved' AND lo.moved_date = ?))
    WHERE ss.is_active = 1 AND (
      (ss.weekday = ? AND ss.week_type IN (?, 'both')
        AND (ss.valid_from IS NULL OR ss.valid_from <= ?) AND (ss.valid_until IS NULL OR ss.valid_until >= ?)
        AND (lo.id IS NULL OR lo.lesson_date = ?))
      OR (lo.status = 'moved' AND lo.moved_date = ?)
    ) AND COALESCE(lo.status, 'normal') <> 'cancelled'
      AND (COALESCE(lo.status, 'normal') <> 'moved' OR lo.moved_date = ?)
    ORDER BY start_time
  `).bind(date, date, weekday(date), type, date, date, date, date, date).all<LessonRow>()
  return result.results.map((row): ContextLesson => ({
    scheduleSlotId: row.schedule_slot_id,
    date,
    originalDate: row.original_date ?? date,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    teacherId: row.teacher_id,
    teacherName: row.teacher_name,
    slotNumber: row.slot_number,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    room: row.room,
  }))
}

function mentionedSubjects(text: string, subjects: SubjectRow[]) {
  const normalized = normalize(text)
  return subjects.filter((subject) => {
    const full = normalize(subject.name)
    const short = normalize(subject.short_name ?? '')
    if (full && normalized.includes(full)) return true
    if (short.length >= 4 && normalized.includes(short)) return true
    // Match single-word course names in ordinary Russian grammatical cases.
    for(const name of [short,full]){
      if(!/^[а-я]{6,}$/.test(name))continue
      const stem=name.replace(/(?:ия|а|я|ь|й)$/u,'')
      if(stem.length>=4&&normalized.split(' ').some(word=>new RegExp(`^${stem}(?:ия|ию|ии|ией|иею|ий|а|я|е|и|у|ю|ы|ой|ом|ою|ах|ам|ами)?$`,'u').test(word)))return true
    }
    return full.split(' ').some((token) => token.length >= 6 && !stopWords.has(token) && normalized.includes(token))
  })
}

export function referencedDates(text: string, messageDate: string) {
  const normalized = normalize(text)
  const dates = new Set<string>()
  for (const match of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) dates.add(match[0])
  for (const match of text.matchAll(/\b(\d{1,2})[./](\d{1,2})(?:[./](20\d{2}))?\b/g)) {
    const year = match[3] ?? messageDate.slice(0, 4)
    dates.add(`${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`)
  }
  if (normalized.includes('сегодня')) dates.add(messageDate)
  if (normalized.split(' ').includes('завтра')) dates.add(addDays(messageDate, 1))
  if (normalized.includes('послезавтра')) dates.add(addDays(messageDate, 2))
  const names = ['понедельник', 'вторник', 'сред', 'четверг', 'пятниц', 'суббот', 'воскресень']
  const quantities:Record<string,number>={одну:1,один:1,два:2,две:2,три:3,четыре:4}
  const relative=normalized.match(/через\s+(\d{1,2}|одну|один|две|два|три|четыре)?\s*(недел\p{L}*|дн\p{L}*|день)/u)
  const amount=relative?(Number(relative[1])||quantities[relative[1]]||1):0
  const weekOffset=relative&&relative[2].startsWith('недел')?amount:/(?:следующ\p{L}*\s+недел|на\s+будущ\p{L}*\s+недел)/u.test(normalized)?1:0
  const namedDay=names.some(name=>normalized.includes(name))
  if(/через\s/u.test(normalized)&&!relative)return []
  if(relative&&namedDay&&!relative[2].startsWith('недел')){const date=addDays(messageDate,amount);return names.some((name,i)=>normalized.includes(name)&&weekday(date)!==i+1)?[]:[date]}
  if(relative&&!namedDay)dates.add(addDays(messageDate,amount*(relative[2].startsWith('недел')?7:1)))
  names.forEach((name, index) => {
    if (!normalized.includes(name)) return
    const delta = weekOffset?index+1-weekday(messageDate)+7*weekOffset:((index + 1 - weekday(messageDate)) + 7) % 7 || (normalized.includes('следующ') ? 7 : 0)
    dates.add(addDays(messageDate, delta))
  })
  return [...dates].filter((value) => {
    const timestamp = Date.parse(`${value}T00:00:00.000Z`)
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
  }).sort()
}

function addCandidate(target: Map<string, SubjectCandidate>, subject: SubjectRow | { id: string; name: string }, priority: number, evidence: SubjectCandidate['evidence']) {
  const existing = target.get(subject.id)
  if (!existing || priority < existing.priority) target.set(subject.id, { subjectId: subject.id, subjectName: subject.name, priority, evidence })
}

async function conversationWindow(db: D1Database, row: MessageRow, previousCount: number, nextCount: number, people: PersonMap) {
  const previous = await db.prepare('SELECT * FROM messages WHERE source_id = ? AND julianday(sent_at) >= julianday(?) AND (sent_at < ? OR (sent_at = ? AND id < ?)) ORDER BY sent_at DESC, id DESC LIMIT ?').bind(row.source_id, MESSAGE_HISTORY_START, row.sent_at, row.sent_at, row.id, previousCount).all<MessageRow>()
  const next = await db.prepare('SELECT * FROM messages WHERE source_id = ? AND julianday(sent_at) >= julianday(?) AND (sent_at > ? OR (sent_at = ? AND id > ?)) ORDER BY sent_at ASC, id ASC LIMIT ?').bind(row.source_id, MESSAGE_HISTORY_START, row.sent_at, row.sent_at, row.id, nextCount).all<MessageRow>()
  const chain: ReplyContextMessage[] = []
  const visited = new Set([row.external_message_id])
  let reply = row.reply_to_json ? JSON.parse(row.reply_to_json) as { externalMessageId?: string; text?: string | null } : null
  for (let depth = 0; reply?.externalMessageId && depth < 5; depth += 1) {
    if (visited.has(reply.externalMessageId)) break
    visited.add(reply.externalMessageId)
    const parent = await db.prepare('SELECT * FROM messages WHERE source_id = ? AND external_message_id = ?').bind(row.source_id, reply.externalMessageId).first<MessageRow>()
    // Unknown-date quotes cannot be proven to fall within the requested history window.
    if (!parent || !isInMessageWindow(parent.sent_at)) break
    chain.push(toContextMessage(parent, people))
    reply = parent.reply_to_json ? JSON.parse(parent.reply_to_json) as { externalMessageId?: string; text?: string | null } : null
  }
  return {
    previous: previous.results.reverse().map((message) => toContextMessage(message, people)),
    current: toContextMessage(row, people),
    next: next.results.map((message) => toContextMessage(message, people)),
    replyChain: chain,
  }
}

export async function buildProcessingContexts(db: D1Database, rows: MessageRow[], options: { timezone: string; previousCount: number; nextCount: number }) {
  const identities = await db.prepare('SELECT i.provider, i.sender_id, p.id AS personId, p.name AS canonicalName, p.nickname, p.role, p.trusted FROM sender_identities i JOIN people p ON p.id = i.person_id').all<Record<string, unknown>>()
  const people: PersonMap = new Map(identities.results.map(({ provider, sender_id, ...person }) => [`${provider}:${sender_id}`, person]))
  const subjects = (await db.prepare('SELECT id, name, short_name FROM subjects ORDER BY name').all<SubjectRow>()).results
  const teachers = (await db.prepare('SELECT DISTINCT t.name, s.subject_id FROM teachers t JOIN schedule_slots s ON s.teacher_id = t.id WHERE s.is_active = 1').all<{ name: string; subject_id: string }>()).results
  const lessonCache = new Map<string, ContextLesson[]>()
  async function effectiveLessons(date: string) {
    if (!lessonCache.has(date)) lessonCache.set(date, await dayLessons(db, date, (await getAcademicWeek(db, date)).type))
    return lessonCache.get(date)!
  }
  const sources=(await db.prepare('SELECT id,name,provider FROM message_sources').all<{id:string;name:string;provider:string}>()).results
  const contexts: ProcessingMessageContext[] = []

  for (const row of rows) {
    if (!isInMessageWindow(row.sent_at)) continue
    const local = localDateTime(row.sent_at, options.timezone)
    const week = await getAcademicWeek(db, local.date)
    const lessons = await effectiveLessons(local.date)
    const conversation = await conversationWindow(db, row, options.previousCount, options.nextCount, people)
    const candidates = new Map<string, SubjectCandidate>()
    for (const subject of mentionedSubjects(row.text ?? '', subjects)) addCandidate(candidates, subject, 1, 'explicit_subject')
    const teacherText = normalize(row.text ?? '')
    for (const teacher of teachers) {
      const surname = normalize(teacher.name.split(' ')[0])
      const subject = subjects.find((item) => item.id === teacher.subject_id)
      if (subject && surname.length >= 3 && teacherText.includes(surname)) addCandidate(candidates, subject, 2, 'explicit_teacher')
    }
    const dates = referencedDates(row.text ?? '', local.date)
    for (const date of dates) {
      for (const lesson of await effectiveLessons(date)) addCandidate(candidates, { id: lesson.subjectId, name: lesson.subjectName }, 3, 'explicit_date')
    }
    for (const message of conversation.replyChain) for (const subject of mentionedSubjects(message.text, subjects)) addCandidate(candidates, subject, 4, 'reply_context')
    for (const message of [...conversation.previous, ...conversation.next]) for (const subject of mentionedSubjects(message.text, subjects)) addCandidate(candidates, subject, 5, 'neighbor_message')

    const minute = Number(local.time.slice(0, 2)) * 60 + Number(local.time.slice(3, 5))
    const toMinute = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
    const activeIndex = lessons.findIndex((lesson) => minute >= toMinute(lesson.startTime) && minute < toMinute(lesson.endTime))
    const active = activeIndex >= 0 ? lessons[activeIndex] : null
    const previous = activeIndex >= 0 ? lessons[activeIndex - 1] ?? null : [...lessons].reverse().find((lesson) => toMinute(lesson.endTime) <= minute) ?? null
    const next = activeIndex >= 0 ? lessons[activeIndex + 1] ?? null : lessons.find((lesson) => toMinute(lesson.startTime) > minute) ?? null
    if (active) addCandidate(candidates, { id: active.subjectId, name: active.subjectName }, 6, 'active_lesson')
    const nearest = previous && next
      ? (minute - toMinute(previous.endTime) < toMinute(next.startTime) - minute ? previous : next)
      : next ?? previous
    if (nearest) addCandidate(candidates, { id: nearest.subjectId, name: nearest.subjectName }, 7, 'nearest_lesson')

    const conversationDates = [...conversation.previous, ...conversation.replyChain, ...conversation.next].map((message) => ({
      messageId: message.id,
      dates: referencedDates(message.text, message.sentAt ? localDateTime(message.sentAt, options.timezone).date : local.date),
    }))
    const referencedLessons: ContextLesson[] = []
    for (const date of new Set([...dates, ...conversationDates.flatMap((item) => item.dates)])) {
      referencedLessons.push(...await effectiveLessons(date))
    }
    const mentionedIds = [...candidates.values()].filter((candidate) => candidate.priority <= 5).map((candidate) => candidate.subjectId)
    const nextDates: Record<string, string[]> = {}
    const nextLessons: Record<string, ContextLesson[]> = {}
    for (const subjectId of mentionedIds) {
      const found: string[] = []
      nextLessons[subjectId] = []
      for (let offset = 1; offset <= 42 && found.length < 4; offset += 1) {
        const date = addDays(local.date, offset)
        const matching = (await effectiveLessons(date)).filter((lesson) => lesson.subjectId === subjectId)
        if (matching.length) {
          found.push(date)
          nextLessons[subjectId].push(...matching)
        }
      }
      nextDates[subjectId] = found
    }

    contexts.push({
      chat:sources.find(source=>source.id===row.source_id),
      currentMessage: conversation.current,
      messageDate: local.date,
      messageTime: local.time,
      weekday: week.weekday,
      weekType: week.type,
      dayLessons: lessons,
      activeLesson: active,
      previousLesson: previous,
      nextLesson: next,
      referencedDates: dates,
      referencedLessons,
      conversationDates,
      subjectCandidates: [...candidates.values()].sort((a, b) => a.priority - b.priority),
      nextLessonDatesBySubject: nextDates,
      nextLessonsBySubject: nextLessons,
      conversation,
    })
  }
  return contexts
}

export type ProcessingMessageRow = MessageRow

/** Subjects named in text directly or through a teacher surname; used to prefer the owner's own words over file contents. */
export async function explicitSubjectIds(db: D1Database, text: string) {
  const subjects = (await db.prepare('SELECT id, name, short_name FROM subjects ORDER BY name').all<SubjectRow>()).results
  const ids = new Set(mentionedSubjects(text, subjects).map((subject) => subject.id))
  if (!ids.size) {
    const normalized = normalize(text)
    const teachers = (await db.prepare('SELECT DISTINCT t.name, s.subject_id FROM teachers t JOIN schedule_slots s ON s.teacher_id = t.id WHERE s.is_active = 1').all<{ name: string; subject_id: string }>()).results
    for (const teacher of teachers) { const surname = normalize(teacher.name.split(' ')[0]); if (surname.length >= 3 && normalized.includes(surname)) ids.add(teacher.subject_id) }
  }
  return [...ids]
}
