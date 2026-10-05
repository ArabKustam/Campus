import type {ProposedAiAction} from '../schemas/ai-action'
import {resolveRecurringCommand,validateRecurrence} from './recurring-lesson'
const dayNames=['понедельник','вторник','сред','четверг','пятниц','суббот','воскресень']
const frequency=(value:string)=>/неч[её]тн/iu.test(value)?'по нечётным неделям':/ч[её]тн/iu.test(value)?'по чётным неделям':/(?:каждую неделю|кажды[йе]|еженедельн|обе недели)/iu.test(value)?'каждую неделю':null
const linePattern=/^(?:во? |по ).*?\d+\s*(?:[-аяуюй]*\s*)?(?:урок|пар|занят)/iu
const slotKey=(line:string)=>`${dayNames.findIndex(d=>line.toLowerCase().includes(d))}:${line.match(/(10|[1-9])\s*(?:[-аяуюй]*\s*)?(?:урок|пар|занят)/iu)?.[1]}`
/** Clarifications replace the addressed draft row; they are not extra lessons. */
export function mergeLessonClarifications(text:string){
 const blocks=text.split('Уточнение пользователя:')
 let rows:string[]=[];let globalWeek:string|null=null
 for(const block of blocks){
  const lines=block.split('\n').map(l=>l.trim().replace(/^["«“]|["»”]$/gu,'')),numbered=lines.filter(l=>linePattern.test(l))
  const global=frequency(lines.filter(l=>!linePattern.test(l)).join('\n'))
  if(global)globalWeek=global
  const previous=rows
  const replacements=numbered.map(line=>{
   const tail=line.replace(/^.*?\d+\s*(?:[-аяуюй]*\s*)?(?:урока?|пара|пару|занятие)\s*[-—:]?\s*/iu,'')
   const onlyWeek=!!frequency(tail)&&!tail.replace(/(?:по |в )?(?:не)?ч[её]тн[а-я]*\s*(?:недел[а-я]*)?|каждую неделю|обе недели|еженедельно|[.,!]/giu,'').trim()
   const matches=previous.filter(old=>slotKey(old)===slotKey(line))
   if(onlyWeek&&matches.length===1){const base=matches[0].replace(/(?:по |в )?(?:не)?ч[её]тн[а-я]*\s*(?:недел[а-я]*)?|каждую неделю|обе недели|еженедельно/giu,'').trim();return `${base} ${frequency(tail)}`}
   return line
  })
  const replaced=new Set(replacements.map(slotKey))
  rows=[...previous.filter(old=>!replaced.has(slotKey(old))),...replacements]
 }
 return {lines:rows,globalWeek}
}
export async function resolveLessonList(db:D1Database,text:string,id:string,timezone:string){
 const {lines,globalWeek}=mergeLessonClarifications(text)
 if(lines.length<2)return null
 if(lines.length>12)return {question:'В одном запросе можно указать до 12 занятий. Разделите список на две части.',proposals:[] as ProposedAiAction[]}
 let missingWeek=false
 const previews:string[]=[],questions:string[]=[],proposals:ProposedAiAction[]=[]
 for(const line of lines){
  const day=dayNames.findIndex(d=>line.toLocaleLowerCase().includes(d))
  if(day<0){questions.push('Не определён день занятия.');continue}
  // A temporary frequency is used only to resolve time and references for the draft.
  const explicitWeek=frequency(line)||globalWeek
  if(!explicitWeek)missingWeek=true
  const resolved=await resolveRecurringCommand(db,`${explicitWeek??'каждую неделю'} ${line}`,id,timezone)
  if(!resolved?.proposal){questions.push(resolved?.question??`Не удалось разобрать строку: ${line}`);continue}
  const p=resolved.proposal,r=p.recurrence!
  const teacher=r.teacherId?await db.prepare('SELECT name FROM teachers WHERE id=?').bind(r.teacherId).first<{name:string}>():null
  previews.push(`${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][day]}, ${r.slotNumber}-я пара · ${p.newTimeStart}–${p.newTimeEnd} · ${r.subjectName}${explicitWeek?` · ${r.weekType==='both'?'каждую неделю':r.weekType==='even'?'чётные недели':'нечётные недели'}`:''}${teacher?` · ${teacher.name}`:''}${p.room?` · ${p.room}`:''}${r.building?` · ${r.building}`:''}`)
  proposals.push(p)
 }
 const draft=previews.join('\n')
 if(questions.length)return {proposals:[],question:`${draft}\n${[...new Set(questions)].join('\n')}`}
 if(missingWeek)return {proposals:[],question:`Распознал занятия:\n${draft}\nЭто расписание на каждую неделю, на чётные или на нечётные недели? Если недели разные, укажите их в каждой строке.`}
 const newProposals:ProposedAiAction[]=[]
 for(const p of proposals){
  const r=p.recurrence!
  const matches=(await db.prepare('SELECT ss.*,s.name AS subject_name FROM schedule_slots ss JOIN subjects s ON s.id=ss.subject_id WHERE ss.is_active=1 AND ss.weekday=? AND (ss.week_type=? OR ss.week_type=\'both\' OR ?=\'both\') AND (ss.valid_until IS NULL OR ss.valid_until>=?) AND (ss.valid_from IS NULL OR ss.valid_from<=?) AND (ss.slot_number=? OR (ss.start_time<? AND ss.end_time>?))').bind(r.weekday,r.weekType,r.weekType,p.targetDate,r.validUntil,r.slotNumber,p.newTimeEnd,p.newTimeStart).all<any>()).results
  const same=matches.length===1&&matches[0].subject_id===p.subjectId&&matches[0].week_type===r.weekType&&matches[0].start_time===p.newTimeStart&&matches[0].end_time===p.newTimeEnd&&matches[0].teacher_id===r.teacherId&&matches[0].room===p.room&&matches[0].building===r.building
  if(same)continue
  const errors=await validateRecurrence(db,p)
  if(errors.length)questions.push(`${r.subjectName}, ${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][r.weekday-1]}, ${r.slotNumber}-я пара: ${matches.length?'уже стоит '+matches.map(m=>`${m.subject_name} (${m.week_type==='odd'?'нечётные':m.week_type==='even'?'чётные':'все'} недели)`).join(', '):'проверьте учебный период'}.`)
  newProposals.push(p)
 }
 if(questions.length)return {proposals:[],question:`${draft}\nНайдены пересечения:\n${questions.join('\n')}\nУточните недели или освободите эти места в редакторе. Занятые пары не заменены.`}
 for(let i=0;i<newProposals.length;i++)for(let j=i+1;j<newProposals.length;j++){const a=newProposals[i],b=newProposals[j],ar=a.recurrence!,br=b.recurrence!;if(ar.weekday===br.weekday&&(ar.weekType===br.weekType||ar.weekType==='both'||br.weekType==='both')&&(ar.slotNumber===br.slotNumber||(a.newTimeStart!<b.newTimeEnd!&&a.newTimeEnd!>b.newTimeStart!)))return {proposals:[],question:'В самом списке занятия пересекаются по дню, неделе и времени. Уточните номер пары или недели.'}}
 const duplicates=new Set<string>();for(const p of newProposals){const r=p.recurrence!,key=`${r.weekday}:${r.slotNumber}:${r.weekType}`;if(duplicates.has(key))return {proposals:[],question:'В списке два занятия на одно место. Уточните день или номер пары.'};duplicates.add(key)}
 const confirmed=/Уточнение пользователя:\s*(?:подтверждаю|да,?\s*добав[ьи]|добавить все|применить)(?:[.!\s]|$)/iu.test(text)
 return {proposals:newProposals,question:confirmed?undefined:`${draft}\nДобавить новых занятий: ${newProposals.length}. Уже совпадающие занятия не дублируются. Напишите «подтверждаю», чтобы применить список.`,summary:draft}
}
