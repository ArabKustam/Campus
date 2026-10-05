/** Pure parsing of text displayed by Platonus. Never infer missing teacher/room/type. */
export type PlatonusLesson = { subject: string; teacher: string | null; lessonType: string; building: string | null; room: string | null; weekday: number; slotNumber: number; startTime: string; endTime: string; weekNumber: number }
export type StudyTable = { title: string; headers: string[]; rows: string[][] }
export type StudySection = { tables: StudyTable[]; links: { title: string; url: string }[]; error: string | null }
export type PlatonusSnapshot = { capturedAt: string; semesterStart: string; semesterEnd: string; weeks: number[]; lessons: PlatonusLesson[]; grades: StudySection; umkd: StudySection }
const types: Record<string,string> = { 'Л':'Лекция', 'ЛЗ':'Лабораторная работа', 'СПЗ':'Семинар / практическое занятие', 'СРС':'СРС', 'СРСП':'СРСП' }
export function parseLesson(text: string, time: string, weekday: number, slotNumber: number, weekNumber: number): PlatonusLesson {
  const match = text.trim().match(/^(.+?),\s*['«“"]([^'»”"]+)['»”"]\s*\(([^)]*)\)\s*(?:,\s*(.*))?$/u)
  const hours = time.trim().match(/^(\d{2}:\d{2})\s*[-–—]\s*(\d{2}:\d{2})$/)
  if (!match || !hours || hours[1] >= hours[2] || ![hours[1],hours[2]].every(v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v))) throw new Error(`Не распознана строка расписания: ${text.slice(0,150)}`)
  const location = (match[4] ?? '').split(',').map(v=>v.trim()).filter(Boolean)
  if(location.length>2) throw new Error(`Неоднозначный корпус или кабинет: ${match[4]}`)
  return { subject:match[1].trim().normalize('NFC'), teacher:match[3].trim().normalize('NFC')||null, lessonType:types[match[2].trim()]??match[2].trim(), building:location[0]??null, room:location[1]??null, weekday,slotNumber,startTime:hours[1],endTime:hours[2],weekNumber }
}
export function semesterDates(text:string) {
 const dates=[...text.matchAll(/\b(\d{2})\.(\d{2})\.(\d{4})\b/g)].map(m=>`${m[3]}-${m[2]}-${m[1]}`)
 const unique=[...new Set(dates)]
 if(unique.length!==2||unique[0]>=unique[1]||unique.some(v=>Number.isNaN(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v))throw new Error('Не удалось однозначно определить начало и конец семестра. Импорт остановлен.')
 return {semesterStart:unique[0],semesterEnd:unique[1]}
}
