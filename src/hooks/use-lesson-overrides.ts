import { useCallback, useEffect, useRef, useState } from 'react'
import { type LessonOverride, type LessonOverrideMap } from '../data/schedule'
import { campusApi, type LessonOverrideResource } from '../lib/campus-api'
import { mapOverrideResources, toOverridePayload } from '../lib/lesson-overrides-api'

const overrideFields: Array<keyof LessonOverride> = ['status', 'note', 'newDate', 'newStart', 'newEnd', 'newBuilding', 'newRoom']

export function useLessonOverrides() {
  const [overrides, setOverrides] = useState<LessonOverrideMap>({})
  const [syncError, setSyncError] = useState<string | null>(null)
  const resourceIds = useRef<Record<string, string>>({})

  const hydrate = useCallback(async () => {
    try {
      const result = await campusApi.schedule('2026-09-01', '2026-12-12')
      const slots = result.slots.flatMap((slot) => typeof slot.id === 'string' && typeof slot.slotNumber === 'number'
        ? [{ id: slot.id, slotNumber: slot.slotNumber }]
        : [])
      const mapped = mapOverrideResources(slots, result.overrides)
      resourceIds.current = mapped.resourceIds
      setOverrides(mapped.overrides)
      setSyncError(null)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Не удалось загрузить изменения расписания')
    }
  }, [])

  useEffect(() => { void hydrate() }, [hydrate])

  const persistOverride = useCallback(async (instanceId: string, patch: Partial<LessonOverride>) => {
    if (!overrideFields.some((field) => patch[field] !== undefined)) return true
    const separator = instanceId.lastIndexOf(':')
    const lessonDate = instanceId.slice(0, separator)
    const slotNumber = Number(instanceId.slice(separator + 1))
    try {
      const day = await campusApi.scheduleDay(lessonDate)
      const lesson = day.lessons.find((item) => item.slotNumber === slotNumber)
      if (!lesson) throw new Error('Занятие не найдено в серверном расписании')
      const payload = toOverridePayload(lesson.scheduleSlotId, lessonDate, patch)
      const existingId = resourceIds.current[instanceId]
      let saved: LessonOverrideResource
      if (existingId) {
        const { scheduleSlotId: _scheduleSlotId, lessonDate: _lessonDate, ...changes } = payload
        saved = await campusApi.patchOverride(existingId, changes)
      } else {
        saved = await campusApi.createOverride(payload)
        resourceIds.current[instanceId] = saved.id
      }
      setSyncError(null)
      return true
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Не удалось сохранить изменение занятия')
      return false
    }
  }, [])

  const updateOverride = useCallback((instanceId: string, patch: Partial<LessonOverride>) => {
    setOverrides((current) => ({ ...current, [instanceId]: { ...current[instanceId], ...patch } }))
    return persistOverride(instanceId, patch)
  }, [persistOverride])

  const revertOverride = useCallback((instanceId: string) => {
    const patch: Partial<LessonOverride> = {
      status: 'normal',
      newDate: '',
      newStart: '',
      newEnd: '',
      newBuilding: '',
      newRoom: '',
    }
    setOverrides((current) => ({ ...current, [instanceId]: { ...current[instanceId], ...patch } }))
    void persistOverride(instanceId, patch)
  }, [persistOverride])

  return { overrides, updateOverride, revertOverride, syncError, refreshOverrides: hydrate }
}