import type { LessonInstance } from '../data/schedule'
import type { ScheduleDayResponse } from './campus-api'

export function mapScheduleDay(day: ScheduleDayResponse): LessonInstance[] {
  return day.lessons.map((lesson) => ({
    audience:lesson.audience, audienceAll:lesson.audienceAll, isMine:lesson.isMine, sourceScope:lesson.sourceScope,
    instanceId: lesson.audience?`${day.date}:${lesson.scheduleSlotId}`:`${lesson.originalDate || day.date}:${lesson.slotNumber}`,
    dateKey: day.date,
    scheduleSlotId: lesson.scheduleSlotId,
    subjectId: lesson.subjectId,
    templateRoom: lesson.templateRoom,
    templateBuilding: lesson.templateBuilding,
    startTime: lesson.startTime,
    endTime: lesson.endTime,
    onlineUrl: lesson.onlineUrl,
    homework: Boolean(lesson.hasHomework),
    materials: Boolean(lesson.hasMaterials),
    slot: lesson.slotNumber,
    title: lesson.subjectName,
    teacherId: lesson.teacherId,
    teacher: lesson.teacherName || 'Преподаватель не указан',
    building: lesson.status === 'online' ? 'Онлайн' : lesson.building || 'Корпус не указан',
    room: lesson.status === 'online' ? (lesson.onlineUrl ? 'Ссылка в занятии' : 'Ссылка пока не добавлена') : lesson.room || 'Аудитория не указана',
    type: lesson.lessonType || undefined,
    state: lesson.status,
    override: lesson.overrideId ? {
      status: lesson.status,
      note: lesson.note || undefined,
      newDate: lesson.movedDate || undefined,
      newStart: lesson.movedStartTime || undefined,
      newEnd: lesson.movedEndTime || undefined,
      newBuilding: locationChanged(lesson.building, lesson.templateBuilding) ? lesson.building! : undefined,
      newRoom: locationChanged(lesson.room, lesson.templateRoom) ? lesson.room! : undefined,
    } : undefined,
  }))
}

// The API returns the effective location even when an override only changes a note.
function locationChanged(value: string | null | undefined, original: string | null | undefined) {
  const normalize = (text: string | null | undefined) => (text ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
  return original !== undefined && Boolean(value?.trim()) && normalize(value) !== normalize(original)
}
export function lessonChangeLabels(lesson: LessonInstance): string[] {
  const override = lesson.override
  if (!override) return []
  return [
    locationChanged(override.newRoom, lesson.templateRoom) ? 'Изменён кабинет' : null,
    locationChanged(override.newBuilding, lesson.templateBuilding) ? 'Изменён корпус' : null,
    (override.newStart && override.newStart !== lesson.startTime) || (override.newEnd && override.newEnd !== lesson.endTime) ? 'Изменено время' : null,
  ].filter((label): label is string => Boolean(label))
}
