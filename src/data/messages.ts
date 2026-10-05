export type MessageSource = 'telegram' | 'whatsapp'
export type MessageState = 'unprocessed' | 'applied' | 'review' | 'ignored' | 'undone' | 'reanalyzing'

export type MessageAttachment = {
  kind: 'image' | 'file'
  name: string
  meta?: string
  previewUrl?: string
}

export type ProcessingResult = {
  recognizedAs: string
  subject?: string
  lessonDate?: string
  extractedText?: string
  state: MessageState
  linkedInstanceId?: string
}

export type InboxMessage = {
  id: string
  source: MessageSource
  groupName: string
  sender: string
  date: string
  time: string
  text: string
  replyContext?: string
  attachments?: MessageAttachment[]
  result?: ProcessingResult
}

export const SEED_MESSAGES: InboxMessage[] = [
  {
    id: 'msg-1',
    source: 'telegram',
    groupName: 'ИБ-23 · Учебная группа',
    sender: 'Дюсенбеков Б.Ж.',
    date: '08.09.2026',
    time: '19:14',
    text: 'На следующую практику сделать лабораторную №4. Условия и примеры загрузил в файлы группы.',
    attachments: [{ kind: 'file', name: 'Лабораторная_4.pdf', meta: 'PDF · 824 КБ' }],
    result: {
      recognizedAs: 'Домашнее задание',
      subject: 'Практикум по программированию',
      lessonDate: '9 сентября',
      extractedText: 'Сделать лабораторную №4',
      state: 'applied',
      linkedInstanceId: '2026-09-09:2',
    },
  },
  {
    id: 'msg-2',
    source: 'whatsapp',
    groupName: 'Основы экономики · 2 курс',
    sender: 'Кошебаева Г.К.',
    date: '02.09.2026',
    time: '18:42',
    text: 'Завтра второй пары не будет. По следующей дате напишу отдельно.',
    replyContext: 'Четверг: 10:55, аудитория 352',
    result: {
      recognizedAs: 'Отмена занятия',
      subject: 'Основы экономики и финансовой грамотности',
      lessonDate: '3 сентября',
      state: 'review',
      linkedInstanceId: '2026-09-03:2',
    },
  },
  {
    id: 'msg-3',
    source: 'telegram',
    groupName: 'Сертификация и стандартизация',
    sender: 'Кутуева Л.А.',
    date: '02.09.2026',
    time: '12:06',
    text: 'Схема по сегодняшней теме. Сохраните, она понадобится для следующей работы.',
    attachments: [{ kind: 'image', name: 'Схема сертификации.png', meta: 'Изображение · 1440×920', previewUrl: '/assets/scheme-certification.svg' }],
    result: {
      recognizedAs: 'Материал занятия',
      subject: 'Сертификация и стандартизация средств информационной безопасности',
      lessonDate: '3 сентября',
      extractedText: 'Схема по теме сертификации',
      state: 'applied',
      linkedInstanceId: '2026-09-03:4',
    },
  },
  {
    id: 'msg-4',
    source: 'whatsapp',
    groupName: 'ИБ-23 · Общая группа',
    sender: 'Алина Садыкова',
    date: '01.09.2026',
    time: '21:31',
    text: 'Кто-нибудь понял, что именно нужно прочитать к философии?',
    replyContext: 'Муканова А.К.: список литературы находится в закреплённом сообщении.',
    result: { recognizedAs: 'Не определено', state: 'unprocessed' },
  },
  {
    id: 'msg-5',
    source: 'telegram',
    groupName: 'Физическая культура',
    sender: 'Ванчурина А.П.',
    date: '01.09.2026',
    time: '08:12',
    text: 'Сегодня занимаемся в большом спортзале. Возьмите сменную обувь.',
    result: {
      recognizedAs: 'Уточнение аудитории',
      subject: 'Физическая культура',
      lessonDate: '1 сентября',
      extractedText: 'Большой спортзал',
      state: 'ignored',
      linkedInstanceId: '2026-09-01:1',
    },
  },
]
