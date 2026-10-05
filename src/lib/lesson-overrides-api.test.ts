import { describe, expect, it } from 'vitest'
import { mapOverrideResources, toOverridePayload } from './lesson-overrides-api'

describe('lesson override API mapping', () => {
  it('maps D1 override resources to date and slot instance IDs', () => {
    expect(mapOverrideResources(
      [{ id: 'slot-a', slotNumber: 3 }],
      [{ id: 'override-a', scheduleSlotId: 'slot-a', lessonDate: '2026-09-03', status: 'moved', movedDate: '2026-09-04', movedStartTime: '10:00', movedEndTime: null, building: null, room: '420', onlineUrl: null, note: 'Перенос' }],
    )).toEqual({
      overrides: { '2026-09-03:3': { status: 'moved', newDate: '2026-09-04', newStart: '10:00', newEnd: undefined, newBuilding: undefined, newRoom: '420', note: 'Перенос' } },
      resourceIds: { '2026-09-03:3': 'override-a' },
    })
  })

  it('converts UI fields to the Worker override schema', () => {
    expect(toOverridePayload('slot-a', '2026-09-03', { status: 'online', newRoom: 'Zoom', newDate: '2026-09-04' })).toEqual({
      scheduleSlotId: 'slot-a', lessonDate: '2026-09-03', status: 'online', movedDate: '2026-09-04', room: 'Zoom',
    })
  })
})
