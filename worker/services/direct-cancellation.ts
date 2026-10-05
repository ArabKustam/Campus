import type {ProcessingMessageContext,ContextLesson} from './processing-context'
import type {ProposedAiAction} from '../schemas/ai-action'
/** Resolve explicit owner cancellations against real occurrences, never from mere proximity. */
export function resolveDirectCancellation(c:ProcessingMessageContext):{proposal?:ProposedAiAction;question?:string}|null{
 const text=c.currentMessage.text.toLocaleLowerCase('ru').replace(/ё/g,'е')
 if(!/(?:отмени(?:ть|те)?|отмен[её]н[аоы]?|не будет)/u.test(text))return null
 if(/(?:не\s+отмен|не\s+надо\s+отмен|не\s+нужно\s+отмен|шутк|шучу|если|\?)/u.test(text))return null
 if(/(?:все|обе)\s+(?:пары|занятия|уроки)/u.test(text))return {question:'Укажите одну пару для отмены: день и номер пары или предмет.'}
 const explicit=c.subjectCandidates.filter(s=>['explicit_subject','explicit_teacher'].includes(s.evidence))
 const priority=Math.min(...explicit.map(s=>s.priority)),subjects=explicit.filter(s=>s.priority===priority)
 let lessons:ContextLesson[]=[]
 const next=/(?:следующ|ближайш)\S*\s+(?:пар|занят|урок)/u.test(text)
 const current=/(?:текущ|сейчас|эту пару)/u.test(text)
 if(c.referencedDates.length)lessons=c.referencedLessons.filter(l=>c.referencedDates.includes(l.date))
 else if(current&&c.activeLesson)lessons=[c.activeLesson]
 else if(next){
  lessons=[...c.dayLessons.filter(l=>l.startTime>c.messageTime),...Object.values(c.nextLessonsBySubject).flat()]
 }else return {question:'На какую дату отменить пару? Например: «завтра первую пару» или «ближайшую пару по социологии».'}
 if(subjects.length)lessons=lessons.filter(l=>subjects.some(s=>s.subjectId===l.subjectId))
 const numbered=text.match(/(?:^|[^\p{L}\d])([1-9]|10)(?:-?(?:ю|я|ую|ой))?\s*(?:пар|урок|занят)/u)
 const word=text.match(/(перв|втор|трет|четверт|пят|шест|седьм|восьм|девят|десят)\p{L}*\s+(?:пар|урок|занят)/u)
 const ordinal=numbered?Number(numbered[1]):word?['перв','втор','трет','четверт','пят','шест','седьм','восьм','девят','десят'].indexOf(word[1])+1:null
 if(ordinal)lessons=lessons.filter(l=>l.slotNumber===ordinal)
 const time=text.match(/(?:в|на)\s+(\d{1,2}):([0-5]\d)/u)
 if(!subjects.length&&!ordinal&&!time&&!next&&!current)return {question:`Какую пару отменить? Укажите номер пары или название предмета${lessons.length?': '+lessons.slice(0,5).map(l=>l.subjectName+' ('+l.startTime+')').join(', '):''}.`}
 if(time)lessons=lessons.filter(l=>l.startTime===`${time[1].padStart(2,'0')}:${time[2]}`)
 lessons=[...new Map(lessons.map(l=>[`${l.scheduleSlotId}:${l.date}`,l])).values()].sort((a,b)=>(a.date+a.startTime).localeCompare(b.date+b.startTime))
 if(next&&lessons.length)lessons=lessons.filter(l=>l.date===lessons[0].date&&l.startTime===lessons[0].startTime)
 if(lessons.length!==1)return {question:lessons.length?`Какую пару отменить: ${lessons.slice(0,5).map(l=>`${l.subjectName}, ${l.date}, ${l.slotNumber}-я (${l.startTime})`).join('; ')}?`:'На указанную дату подходящая активная пара не найдена. Проверьте день, номер пары или название предмета.'}
 const l=lessons[0]
 return {proposal:{messageId:c.currentMessage.id,action:'CANCEL_LESSON',subjectId:l.subjectId,targetDate:l.originalDate,targetLessonId:l.scheduleSlotId,content:null,confidence:1,reason:`Прямая команда владельца: ${l.subjectName}, ${l.date}, ${l.slotNumber}-я пара (${l.startTime}). Занятие однозначно найдено в расписании.`}}
}
