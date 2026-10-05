import type { LessonOverride, LessonOverrideMap } from '../data/schedule'
import type { LessonOverrideResource } from './campus-api'

type SlotReference = { id: string; slotNumber: number }

export function mapOverrideResources(slots: SlotReference[], resources: LessonOverrideResource[]) {
  const slotNumbers = new Map(slots.map((slot) => [slot.id, slot.slotNumber]))
  const overrides: LessonOverrideMap = {}
  const resourceIds: Record<string, string> = {}
  for (const resource of resources) {
    const slotNumber = slotNumbers.get(resource.scheduleSlotId)
    if (!slotNumber) continue
    const instanceId = `${resource.lessonDate}:${slotNumber}`
    overrides[instanceId] = {
      status: resource.status,
      newDate: resource.movedDate ?? undefined,
      newStart: resource.movedStartTime ?? undefined,
      newEnd: resource.movedEndTime ?? undefined,
      newBuilding: resource.building ?? undefined,
      newRoom: resource.room ?? undefined,
      note: resource.note ?? undefined,
    }
    resourceIds[instanceId] = resource.id
  }
  return { overrides, resourceIds }
}

export function toOverridePayload(scheduleSlotId: string, lessonDate: string, patch: Partial<LessonOverride>) {
  return {
    scheduleSlotId,
    lessonDate,
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.newDate !== undefined ? { movedDate: patch.newDate || null } : {}),
    ...(patch.newStart !== undefined ? { movedStartTime: patch.newStart || null } : {}),
    ...(patch.newEnd !== undefined ? { movedEndTime: patch.newEnd || null } : {}),
    ...(patch.newBuilding !== undefined ? { building: patch.newBuilding || null } : {}),
    ...(patch.newRoom !== undefined ? { room: patch.newRoom || null } : {}),
    ...(patch.note !== undefined ? { note: patch.note || null } : {}),
  }
}
