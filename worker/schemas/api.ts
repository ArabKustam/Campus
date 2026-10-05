import { z } from 'zod'

export const idSchema = z.string().trim().min(1).max(160)
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата YYYY-MM-DD').refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Некорректная дата')
export const isoDateTimeSchema = z.string().datetime({ offset: true })
export const lessonStatusSchema = z.enum(['normal', 'cancelled', 'moved', 'online', 'important', 'exam'])

export const dateQuerySchema = z.object({ date: dateSchema })
export const scheduleRangeSchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
}).refine((value) => !value.from || !value.to || value.from <= value.to, { message: 'from не может быть позже to', path: ['to'] })

export const createOverrideSchema = z.object({
  scheduleSlotId: idSchema,
  lessonDate: dateSchema,
  status: lessonStatusSchema.default('normal'),
  movedDate: dateSchema.nullish(),
  movedStartTime: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
  movedEndTime: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
  building: z.string().max(200).nullish(),
  room: z.string().max(100).nullish(),
  onlineUrl: z.string().url().nullish(),
  note: z.string().max(5000).nullish(),
})

// status без default: иначе PATCH одной заметки молча сбрасывал отмену/перенос в 'normal'.
export const patchOverrideSchema = createOverrideSchema.omit({ scheduleSlotId: true, lessonDate: true }).extend({ status: lessonStatusSchema }).partial().refine((value) => Object.keys(value).length > 0, 'Передайте хотя бы одно поле')

export const createHomeworkSchema = z.object({
  subjectId: idSchema,
  scheduleSlotId: idSchema.nullish(),
  lessonOverrideId: idSchema.nullish(),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(10_000).nullish(),
  assignedAt: isoDateTimeSchema.nullish(),
  dueAt: isoDateTimeSchema.nullish(),
})

export const patchHomeworkSchema = createHomeworkSchema.omit({ subjectId: true }).partial().extend({
  status: z.enum(['open', 'done', 'archived']).optional(),
}).refine((value) => Object.keys(value).length > 0, 'Передайте хотя бы одно поле')

export const createMaterialSchema = z.object({
  subjectId: idSchema.nullish(),
  scheduleSlotId: idSchema.nullish(),
  lessonOverrideId: idSchema.nullish(),
  title: z.string().trim().min(1).max(300),
  kind: z.enum(['link', 'document', 'image', 'book', 'note']),
  url: z.string().url().nullish(),
  description: z.string().max(10_000).nullish(),
  lessonDate: dateSchema.nullish(),
})

export const patchMaterialSchema = createMaterialSchema.omit({ subjectId: true, scheduleSlotId: true, lessonOverrideId: true }).partial().refine((value) => Object.keys(value).length > 0, 'Передайте хотя бы одно поле')

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  status: z.string().optional(),
  slot: idSchema.optional(),
  date: dateSchema.optional(),
})
