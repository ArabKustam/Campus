import { detectLessonType } from './recurring-lesson'
import type { ProposedAiAction } from '../schemas/ai-action'
import type { ProcessingMessageContext } from './processing-context'

export const classificationInstructions = `
ADD_LESSON is a new one-off scheduled session, including СРС, СРСП or a consultation. It is NOT homework merely because it is called СРС.
Example: "завтра добавили СРС по экономике с 16:00 до 17:00, кабинет 420" -> ADD_LESSON, content "СРС", targetLessonId null, explicit start/end, established subject and date.
"сделать СРС 4 к четвергу" -> ADD_HOMEWORK. Missing subject, date or either time for a new session -> UNKNOWN. Never infer teacher or duration.
Treat jokes, irony, retractions and conflicting announcements as uncertain. A title like head student does not prove a claim. Mass cancellations require human review; never expand "все пары отменены" into multiple automatic cancellations.
sender.personId/canonicalName/nickname/role are manual owner-assigned identity links: matching personId means the same person across providers. Never infer identity from names. Role and trusted flag are not proof of the truth of an announcement. Contradictions, jokes or missing facts still require review.
Classify intent before resolving the subject or lesson. Academic content alone is never homework.
ADD_HOMEWORK requires an explicit instruction to complete work, including assigned reading. A deadline alone is insufficient.
"к следующей паре сделать лабораторную 4" and "прочитать главы 2-4 к четвергу" are ADD_HOMEWORK when their subject is established.
"вот литература по экономике: Мэнкью... Кейнс... Самуэльсон..." is ADD_BOOK_LIST, never homework unless reading/completion is explicitly assigned.
"скидываю методичку" and "вот презентация с пары" are ADD_MATERIAL, not homework.
"завтра первой пары не будет" is CANCEL_LESSON; resolve the first slot on the supplied tomorrow date.
"экономику перенесли на пятницу на 14:00" is MOVE_LESSON with newTimeStart 14:00; do not invent an end time.
"завтра вместо 352 идем в 420" is CHANGE_ROOM with room 420; 352 is the old room, not a lesson number.
"пара будет в Teams" is SET_ONLINE; url stays null unless an actual URL is supplied.
Questions, speculation, negated assignments and reports of completed work are not instructions.
Read connected conversation turns together: Маша: "завтра английский будет?"; Староста: "нет"; Староста: "препод заболел" establishes CANCEL_LESSON for tomorrow's English.
Attribute that cancellation to the answer "нет", not the question or the repeated explanation. Illness alone does not establish a cancellation.
Use reply links, speaker continuity and an unambiguous nearby question to resolve short answers. Unrelated neighbors are not evidence.
Use conversationDates to resolve relative dates in each originating message, including across midnight.
Prefer explicit subject/teacher and connected reply context. Dates only narrow candidates; subjectCandidates priorities are hints, not proof.
Active/nearest lessons alone never establish the subject. Require an explicit reference such as "с этой пары" before using proximity.
If the subject or required lesson is ambiguous, return UNKNOWN with null target fields, explaining what is missing.
Never invent subjects, lessons, dates, deadlines, room numbers, URLs or times. Preserve missing optional fields as null.
`

// A conservative backstop: the model cannot turn a bare resource into homework.
export function hasWorkInstruction(text: string) {
  const value = text.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')
  const instruction = /(?:^|[^\p{L}])(?:сделать|сделайте|выполнить|выполните|решить|решите|прочитать|прочитайте|читать|читайте|подготовить|подготовьте|написать|напишите|сдать|сдайте|выучить|выучите|изучить|изучите|оформить|оформите|принести|принесите)(?=$|[^\p{L}])/u
  if (!instruction.test(value)) return false
  const boundary = '(?:^|[^\\p{L}])'
  const verb = '(?:сделать|сделайте|выполнить|выполните|решить|решите|прочитать|прочитайте|читать|читайте|подготовить|подготовьте|написать|напишите|сдать|сдайте|выучить|выучите|изучить|изучите|оформить|оформите|принести|принесите)'
  if (new RegExp(`${boundary}(?:не|нельзя)\\s+${verb}`, 'u').test(value)) return false
  if (new RegExp(`${boundary}(?:уже|удалось|успел[аи]?|смог(?:ла|ли)?)\\s+(?:все\\s+)?${verb}`, 'u').test(value)) return false
  if (/[?？]/u.test(value)) return false
  if (/(?:не\s+(?:нужно|надо|требуется|обязательно)|отмен(?:ено|яется)|по желанию|необязательно|если хотите)/u.test(value)) return false
  if (new RegExp(`${boundary}(?:можно|могу|хочу|планирую|собираюсь|как)\\s+(?:не\\s+)?${verb}`, 'u').test(value)) return false
  return true
}

export function guardClassification(action: ProposedAiAction, context: ProcessingMessageContext, direct = false): ProposedAiAction {
  if (['IGNORE', 'UNKNOWN'].includes(action.action)) return action
  const speaker = context.currentMessage.sender
  const retracts = (context.conversation?.next ?? []).some((message) => {
    const samePerson = speaker?.personId && speaker.personId === message.sender.personId
    const sameSender = speaker?.id && speaker.id === message.sender.id
    return (samePerson || sameSender) && /(?:шучу|это шутка|пошутил|розыгрыш|не отменяли|ошибся|ошиблась)/iu.test(message.text)
  })
  if (!direct && retracts && ['CANCEL_LESSON', 'MOVE_LESSON', 'ADD_LESSON'].includes(action.action)) return {
    ...action, action: 'UNKNOWN', subjectId: null, targetDate: null, targetLessonId: null, confidence: 0,
    reason: 'Автор затем отозвал объявление или назвал его шуткой. Требуется проверка человеком.',
  }
  if (!direct && action.action === 'CANCEL_LESSON' && /(?:шучу|шутка|прикол|розыгрыш|все.{0,20}(?:пары|уроки|занятия)|(?:пары|уроки|занятия).{0,20}все)/iu.test(context.currentMessage.text)) return {
    ...action, action: 'UNKNOWN', subjectId: null, targetDate: null, targetLessonId: null, confidence: 0,
    reason: 'Шутка или массовая отмена: требуется проверка человеком.',
  }
  if (action.action === 'ADD_LESSON') {
    action={...action,lessonType:detectLessonType(context.currentMessage.text)}
    const ranges = [...context.currentMessage.text.matchAll(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)\s*(?:до|[-–—])\s*([01]?\d|2[0-3]):([0-5]\d)(?!\d)/gu)]
    if (ranges.length === 1) {
      const [, h1, m1, h2, m2] = ranges[0]
      const start = `${h1.padStart(2, '0')}:${m1}`, end = `${h2.padStart(2, '0')}:${m2}`
      // Copy an explicitly stated range; never infer a duration or fill from neighboring lessons.
      if (!action.newTimeStart && !action.newTimeEnd) action = { ...action, newTimeStart: start, newTimeEnd: end }
      else if (!action.newTimeEnd && action.newTimeStart === start) action = { ...action, newTimeEnd: end }
      else if (!action.newTimeStart && action.newTimeEnd === end) action = { ...action, newTimeStart: start }
    }
  }
  if (action.action === 'ADD_LESSON' && (!action.newTimeStart || !action.newTimeEnd)) return {
    ...action, action: 'UNKNOWN', subjectId: null, targetDate: null, targetLessonId: null, confidence: 0,
    reason: 'Для нового занятия нужно явно указать начало и окончание.',
  }
  const resource = ['ADD_MATERIAL', 'ADD_BOOK_LIST', 'ADD_LINK'].includes(action.action)
  if (!action.subjectId || (!resource && !(direct && action.action === 'ADD_HOMEWORK') && !action.targetDate)) return {
    messageId: action.messageId, action: 'UNKNOWN', subjectId: null,
    targetDate: null, targetLessonId: null, content: null, confidence: 0,
    reason: 'Недостаточно данных для однозначного определения предмета или занятия.',
  }
  if (action.action !== 'ADD_HOMEWORK') return action
  // Neighboring assignments must not leak into unrelated current messages.
  if (hasWorkInstruction(context.currentMessage.text)) return action
  return {
    messageId: action.messageId, action: 'UNKNOWN', subjectId: null,
    targetDate: null, targetLessonId: null, content: null, confidence: 0,
    reason: 'В сообщении нет однозначного указания выполнить работу; домашнее задание не создано.',
  }
}
