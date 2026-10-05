import { recurrenceSchema } from '../services/recurring-lesson'
import { z } from 'zod'

export const aiActionNames = [
  'ADD_LESSON', 'ADD_HOMEWORK', 'ADD_NOTE', 'ADD_MATERIAL', 'ADD_BOOK_LIST', 'ADD_LINK',
  'CANCEL_LESSON', 'MOVE_LESSON', 'CHANGE_ROOM', 'CHANGE_TIME', 'SET_ONLINE',
  'IGNORE', 'UNKNOWN',
] as const

export const aiActionSchema = z.object({
  lessonType: z.enum(['Лекция','Семинар','Практическое занятие','Лабораторная работа','СРС','СРСП','Консультация','Экзамен']).nullable().optional(),
  recurrence: recurrenceSchema.optional(),
  messageId: z.string().min(1),
  action: z.enum(aiActionNames),
  subjectId: z.string().min(1).nullable(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  targetLessonId: z.string().min(1).nullable(),
  content: z.string().trim().min(1).max(10_000).nullable(),
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  newTimeStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  newTimeEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  room: z.string().trim().min(1).max(200).nullable().optional(),
  url: z.string().url().nullable().optional(),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().min(1).max(2_000),
}).strict()

export const aiBatchSchema = z.object({ actions: z.array(aiActionSchema).max(100) }).strict()
export type ProposedAiAction = z.infer<typeof aiActionSchema>
export type AiActionName = ProposedAiAction['action']

export const workersAiJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['actions'],
  properties: {
    actions: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['messageId', 'action', 'subjectId', 'targetDate', 'targetLessonId', 'content', 'confidence', 'reason', 'newDate', 'newTimeStart', 'newTimeEnd', 'room', 'url'],
        properties: {
          messageId: { type: 'string' },
          action: { type: 'string', enum: aiActionNames },
          subjectId: { type: ['string', 'null'] },
          targetDate: { type: ['string', 'null'] },
          targetLessonId: { type: ['string', 'null'] },
          content: { type: ['string', 'null'] },
          newDate: { type: ['string', 'null'] },
          newTimeStart: { type: ['string', 'null'] },
          newTimeEnd: { type: ['string', 'null'] },
          room: { type: ['string', 'null'] },
          url: { type: ['string', 'null'], format: 'uri' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reason: { type: 'string', minLength: 1, maxLength: 2000 },
        },
      },
    },
  },
} as const
