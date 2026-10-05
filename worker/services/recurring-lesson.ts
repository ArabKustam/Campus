import { z } from 'zod'
import { getAcademicWeek } from '../lib/academic-week'
import type { ProposedAiAction } from '../schemas/ai-action'
export function detectLessonType(text:string){
 const matches=[['Лекция',/(?:лекци[яиюй]|лекционная)/iu],['Семинар',/семинар/iu],['Практическое занятие',/практическ/iu],['Лабораторная работа',/лабораторн/iu],['СРСП',/срсп/iu],['СРС',/(?:^|\s)срс(?:\s|$)/iu],['Консультация',/консультац/iu],['Экзамен',/экзамен/iu]] as const
 const types=matches.filter(([,pattern])=>pattern.test(text));return types.length===1?types[0][0]:null
}
export const recurrenceSchema=z.object({subjectName:z.string().trim().min(1).max(200),weekday:z.number().int().min(1).max(7),weekType:z.enum(['odd','even','both']),slotNumber:z.number().int().min(1).max(10),teacherId:z.string().nullable(),building:z.string().nullable(),validUntil:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict()
const normalize=(s:string)=>s.toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N} ]/gu,' ').trim()
const stems=(s:string)=>normalize(s).split(/\s+/).filter(w=>w.length>=5).map(w=>w.replace(/(?:ия|ию|ии|а|е|ы|у|и)$/u,''))
/** Only the authenticated owner's direct chat calls this resolver. Messenger claims never reach it. */
export async function resolveRecurringCommand(db:D1Database,text:string,messageId:string,timezone:string):Promise<{proposal?:ProposedAiAction;question?:string}|null>{
 text=text.replace(/культуралоги/giu,'культурологи').replace(/глабн/giu,'главн').replace(/числител[а-я]*(?:\s+недел[а-я]*)?/giu,'нечётные недели').replace(/знаменател[а-я]*(?:\s+недел[а-я]*)?/giu,'чётные недели')
 // These are command words, never part of a subject name.
 text=text.replace(/((?:пара|пару|парой|урок|урока|занятие)\s+)(?:(?:теперь|будет|урок|занятие|пара)\s+)+/giu,'$1')
 const value=normalize(text)
 if(/(?:не будет|отмен|убер|удал|не добав|не став)/u.test(value))return null
 if(!/(?:по |кажд|недел|(?:^| )во? (?:понедельник|вторник|сред|четверг|пятниц|суббот|воскресень))/u.test(value)||!/(?:пар[ауыо]|занят|урок)/u.test(value))return null
 const dayNames=['понедельник','вторник','сред','четверг','пятниц','суббот','воскресень']
 const days=dayNames.flatMap((name,i)=>value.includes(name)?[i+1]:[])
 if(days.length!==1)return null
 const weekType=/(?:нечетн)/u.test(value)?'odd':/(?:четн)/u.test(value)?'even':/(?:каждую неделю|кажды[йе]|еженедельн|по (?:понедельник|вторник|сред|четверг|пятниц|суббот|воскресень))/u.test(value)?'both':null
 if(!weekType)return {question:'Занятие будет каждую неделю, по чётным или по нечётным?'}
 const ordinal=['перв','втор','треть','четверт','пят','шест','седьм','восьм','девят','десят']
 const wordSlot=ordinal.findIndex(stem=>new RegExp(`(?:^| )${stem}[а-я]* (?:пара|пару|парой|урок|урока|занятие)`).test(value))
 const digitSlot=text.match(/(?:^|\s)(10|[1-9])\s*(?:[-–]?[аяйуюое]+\s*)?(?:пара|пару|парой|урок|урока|занятие)/iu)
 const slotNumber=digitSlot?Number(digitSlot[1]):wordSlot>=0?wordSlot+1:null
 if(!slotNumber)return {question:'Какой номер пары поставить в этот день?'}
 const nameMatch=text.match(/(?:пара|пару|парой|урок|урока|занятие)\s*(?:(?:[-–—:]|будет)\s*)?([\p{L}\p{N}][\p{L}\p{N} \-]{0,199}?)(?=\s+(?:ее|её|его|ведет|ведёт|будет вести|преподаватель|учитель|в том|кабинет|кажд|по (?:не)?ч[её]тн|в (?:не)?ч[её]тн)|[.,;\n]|$)/iu)
 if(!nameMatch)return {question:'Как называется предмет, который добавить на эту пару?'}
 const subjectName=nameMatch[1].trim().replace(/^культурологии$/iu,'культурология'), subjects=(await db.prepare('SELECT id,name,short_name FROM subjects').all<{id:string;name:string;short_name:string|null}>()).results
 const matched=subjects.filter(s=>[s.name,s.short_name].some(n=>n&&normalize(n)===normalize(subjectName)))
 if(matched.length>1)return {question:'В справочнике несколько предметов с таким названием. Уточните название.'}
 const explicitTime=text.match(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)\s*(?:до|[-–—])\s*([01]?\d|2[0-3]):([0-5]\d)(?!\d)/u)
 const times=explicitTime?[{start_time:`${explicitTime[1].padStart(2,'0')}:${explicitTime[2]}`,end_time:`${explicitTime[3].padStart(2,'0')}:${explicitTime[4]}`} ]:(await db.prepare('SELECT DISTINCT start_time,end_time FROM schedule_slots WHERE is_active=1 AND slot_number=?').bind(slotNumber).all<{start_time:string;end_time:string}>()).results
 if(times.length!==1)return {question:`Для ${slotNumber}-й пары нет единого времени в расписании. Укажите начало и окончание.`}
 let teacherId:string|null=null,building:string|null=null,room:string|null=null,referenceName:string|null=null
 if(matched.length===1){const known=(await db.prepare('SELECT DISTINCT teacher_id,building,room FROM schedule_slots WHERE is_active=1 AND subject_id=?').bind(matched[0].id).all<{teacher_id:string|null;building:string|null;room:string|null}>()).results;const teachers=[...new Set(known.map(r=>r.teacher_id))];if(teachers.length===1)teacherId=teachers[0];const locations=[...new Set(known.map(r=>JSON.stringify([r.building,r.room])))];if(locations.length===1){building=known[0].building;room=known[0].room}}
 const copyTeacher=/(?:та же|тот же|того же|той же).{0,35}(?:учитель|преподавател)|(?:учитель|преподавател).{0,45}(?:как|что и)/iu.test(text)
 const copyRoom=/(?:том же|той же|тот же|та же).{0,15}(?:кабинет|аудитор)|(?:кабинет|аудитор).{0,20}(?:как|что и)/iu.test(text)
 if(copyTeacher||copyRoom){
   const tail=text.match(/(?:что и|как (?:у|на)?)\s+(.+)/iu)?.[1]??''
   const refs=subjects.filter(s=>stems(s.short_name||s.name).some(stem=>stems(tail).includes(stem)))
   if(refs.length!==1)return {question:'С какого предмета взять преподавателя и кабинет? Укажите его название.'}
   referenceName=refs[0].name
   const rows=(await db.prepare('SELECT DISTINCT teacher_id,building,room FROM schedule_slots WHERE is_active=1 AND subject_id=?').bind(refs[0].id).all<{teacher_id:string|null;building:string|null;room:string|null}>()).results
   if(copyTeacher){const ids=[...new Set(rows.map(r=>r.teacher_id))];if(ids.length!==1||!ids[0])return {question:`У предмета «${referenceName}» не указан один однозначный преподаватель. Уточните имя.`};teacherId=ids[0]}
   if(copyRoom){const locations=[...new Set(rows.map(r=>JSON.stringify([r.building,r.room])))];if(locations.length!==1||!rows[0]?.room)return {question:`У предмета «${referenceName}» разные или неуказанные кабинеты. Уточните кабинет.`};building=rows[0].building;room=rows[0].room}
 }
 const explicitRoom=text.match(/(?:кабинет[а-я]*|аудитори[а-я]*)(?:\s+|(?=\d))(?:№\s*)?([\p{L}\d-]{1,20})/iu)
 if(explicitRoom&&!/^(?:том|тот|той|та|же|как|что|и|в|на|добавь|добавить|поставь|пожалуйста)$/iu.test(explicitRoom[1]))room=explicitRoom[1]
 if(/главн[а-я]*\s+корпус/iu.test(text))building='Главный корпус'
 const numberedBuilding=text.match(/корпус[а-я]*\s*№?\s*(\d+)/iu);if(numberedBuilding)building=`Корпус №${numberedBuilding[1]}`
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
 const period=await db.prepare("SELECT value_json FROM settings WHERE key='academic_period'").first<{value_json:string}>()
 const validUntil=period?JSON.parse(period.value_json).semesterEnd:null
 if(!validUntil||validUntil<today)return {question:'Сначала задайте действующий учебный период в настройках расписания.'}
 let targetDate:string|null=null
 for(let i=0;i<15;i++){const date=new Date(`${today}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+i);const key=date.toISOString().slice(0,10),week=await getAcademicWeek(db,key);if(week.inPeriod&&week.weekday===days[0]&&(weekType==='both'||week.type===weekType)){targetDate=key;break}}
 if(!targetDate)return {question:'В текущем учебном периоде нет подходящей даты. Проверьте даты семестра.'}
 return {proposal:{messageId,lessonType:detectLessonType(text),action:'ADD_LESSON',subjectId:matched[0]?.id??null,targetDate,targetLessonId:null,content:subjectName,newTimeStart:times[0].start_time,newTimeEnd:times[0].end_time,room,confidence:1,reason:`Прямая команда владельца. Время взято из ${slotNumber}-й пары.${referenceName?` Преподаватель/кабинет взяты из «${referenceName}».`:''}`,recurrence:{subjectName,weekday:days[0],weekType,slotNumber,teacherId,building,validUntil}}}
}
export async function validateRecurrence(db:D1Database,action:ProposedAiAction){
 const r=action.recurrence!,errors:string[]=[]
 if(!action.targetDate||!action.newTimeStart||!action.newTimeEnd||action.newTimeStart>=action.newTimeEnd||action.targetDate>r.validUntil)errors.push('INVALID_RECURRING_RANGE')
 if(r.teacherId&&!await db.prepare('SELECT id FROM teachers WHERE id=?').bind(r.teacherId).first())errors.push('TEACHER_NOT_FOUND')
 if(action.targetDate){const week=await getAcademicWeek(db,action.targetDate);if(!week.inPeriod||week.weekday!==r.weekday||(r.weekType!=='both'&&week.type!==r.weekType))errors.push('INVALID_RECURRENCE_DATE')}
 const conflict=await db.prepare(`SELECT id FROM schedule_slots WHERE is_active=1 AND weekday=? AND (week_type=? OR week_type='both' OR ?='both') AND (valid_until IS NULL OR valid_until>=?) AND (valid_from IS NULL OR valid_from<=?) AND (slot_number=? OR (start_time<? AND end_time>?)) LIMIT 1`).bind(r.weekday,r.weekType,r.weekType,action.targetDate,r.validUntil,r.slotNumber,action.newTimeEnd,action.newTimeStart).first()
 if(conflict)errors.push('RECURRING_SLOT_OCCUPIED')
 return errors
}
