import {expect,it} from 'vitest'
import {referencedDates} from '../services/processing-context'
it.each([
 ['отмени пару по физкультуре в пятницу но через 2 недели','2026-10-02'],
 ['в пятницу через две недели','2026-10-02'],
 ['в пятницу на следующей неделе','2026-09-25'],
 ['через 2 недели','2026-10-01'],
 ['через три дня','2026-09-20'],
 ['в пятницу','2026-09-18'],
])('resolves %s without dropping the relative qualifier',(text,date)=>expect(referencedDates(text,'2026-09-17')).toEqual([date]))
