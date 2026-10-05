import {studentName} from '../../src/lib/person-name'
import type {Bindings} from '../types'
import type {PlatonusLesson,PlatonusSnapshot} from '../../bridge/platonus-parser'
import type {GroupMember} from '../groups/routes'
// Schedule-change notifications live in central D1 (migrations/0030). Every access tolerates a missing table so the app keeps working until the migration is applied.
export type ScheduleKind='cancelled'|'moved'|'room'|'time'|'teacher'|'added'|'removed'|'type'|'online'|'restored'|'platonus_update'|'group_change'
export type ScheduleChange={kind:ScheduleKind;subject:string;date:string|null;weekday?:number;slot?:number;time?:string|null;weekType?:'both'|'odd'|'even'|null;from?:string|null;to?:string|null;key:string}
const WEEKDAYS=['понедельникам','вторникам','средам','четвергам','пятницам','субботам','воскресеньям'],MONTHS=['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек']
export const missingTable=(e:unknown)=>/no such table/i.test(String((e as Error)?.message??e))
export async function tolerate<T>(work:()=>Promise<T>,fallback:T){try{return await work()}catch(e){if(missingTable(e))return fallback;throw e}}
const hash=async(v:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,40)
const clean=(v:unknown)=>String(v??'').normalize('NFC').toLocaleLowerCase().replace(/\s+/g,' ').trim()
const place=(building?:string|null,room?:string|null)=>[building,room].map(v=>v?.trim()).filter(Boolean).join(', ')||null
export const shortDate=(date:string)=>{const [,m,d]=date.split('-').map(Number);return `${d} ${MONTHS[m-1]}`}
const addDays=(date:string,days:number)=>{const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
export const localToday=()=>new Date(Date.now()+5*3600000).toISOString().slice(0,10)
export const KIND_TITLES:Record<ScheduleKind,string>={cancelled:'Занятие отменено',moved:'Занятие перенесено',room:'Изменилась аудитория',time:'Изменилось время',teacher:'Сменился преподаватель',added:'Новое занятие',removed:'Занятие убрано',type:'Изменился тип занятия',online:'Занятие онлайн',restored:'Занятие по расписанию',platonus_update:'В Platonus изменилось расписание',group_change:'Изменения в расписании группы'}
export function describeChange(c:ScheduleChange){
 switch(c.kind){
  case 'cancelled':return 'отменена'
  case 'moved':return `перенесена на ${c.to}`
  case 'room':return `аудитория ${c.from??'не указана'} → ${c.to??'не указана'}`
  case 'time':return `время ${c.from} → ${c.to}`
  case 'teacher':return `преподаватель ${c.from??'не указан'} → ${c.to??'не указан'}`
  case 'type':return c.from?`тип занятия ${c.from} → ${c.to}`:`отмечена: ${c.to}`
  case 'online':return 'пройдёт онлайн'
  case 'restored':return 'пройдёт по расписанию'
  case 'added':return `новое занятие${c.to?` (${c.to})`:''}`
  case 'removed':return 'убрана из расписания'
  default:return ''
 }
}
/** "3 окт, 2 пара" for a dated lesson, "по понедельникам, 2 пара · с 6 окт" for a regular one. */
export function whenChange(c:ScheduleChange){
 const pair=c.slot?`${c.slot} пара`:''
 if(c.weekday===undefined)return [c.date?shortDate(c.date):'',pair].filter(Boolean).join(', ')
 const parity=c.weekType==='odd'?' (нечётные недели)':c.weekType==='even'?' (чётные недели)':''
 return `по ${WEEKDAYS[c.weekday-1]??''}${pair?`, ${pair}`:''}${parity}${c.date?` · с ${shortDate(c.date)}`:''}`
}
const plural=(n:number)=>n%10===1&&n%100!==11?'изменение':[2,3,4].includes(n%10)&&![12,13,14].includes(n%100)?'изменения':'изменений'
const changeKey=(c:Omit<ScheduleChange,'key'>)=>[c.kind,clean(c.subject),c.date??'',c.weekday??'',c.slot??'',c.weekType??'',clean(c.from),clean(c.to)].join('|')
const make=(c:Omit<ScheduleChange,'key'>):ScheduleChange=>({...c,key:changeKey(c)})

/** Monday-based date of a Platonus week day, moved forward to the first occurrence on or after today. */
function nextOccurrence(s:PlatonusSnapshot,weekday:number,parity:number|null,today:string){
 const dates=s.weeks.filter(w=>parity===null||w%2===parity).map(w=>{const d=new Date(`${s.semesterStart}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-(d.getUTCDay()||7)+1+(w-1)*7+weekday-1);let date=d.toISOString().slice(0,10);while(date<today)date=addDays(date,parity===null?7:14);return date})
 const date=dates.sort()[0]
 return date&&date<=s.semesterEnd?date:null
}
export function diffPlatonusSchedule(prev:PlatonusSnapshot,next:PlatonusSnapshot,today=localToday()):ScheduleChange[]{
 // A new semester or an empty (holiday/glitch) week is not a "change" worth a notification.
 if(prev.semesterStart!==next.semesterStart||!next.lessons.length||!prev.lessons.length)return []
 const index=(s:PlatonusSnapshot)=>new Map(s.lessons.map(l=>[`${l.weekNumber%2}:${l.weekday}:${l.slotNumber}`,l]))
 const a=index(prev),b=index(next),raw:{parity:number;change:Omit<ScheduleChange,'key'|'date'|'weekType'>}[]=[]
 const base=(l:PlatonusLesson)=>({subject:l.subject,weekday:l.weekday,slot:l.slotNumber,time:l.startTime})
 for(const key of new Set([...a.keys(),...b.keys()])){
  const parity=Number(key.split(':')[0]),o=a.get(key),n=b.get(key),push=(change:Omit<ScheduleChange,'key'|'date'|'weekType'>)=>raw.push({parity,change})
  if(o&&n&&clean(o.subject)===clean(n.subject)){
   if(clean(o.teacher)!==clean(n.teacher))push({...base(n),kind:'teacher',from:o.teacher,to:n.teacher})
   if(clean(place(o.building,o.room))!==clean(place(n.building,n.room)))push({...base(n),kind:'room',from:place(o.building,o.room),to:place(n.building,n.room)})
   if(o.startTime!==n.startTime||o.endTime!==n.endTime)push({...base(n),kind:'time',from:`${o.startTime}–${o.endTime}`,to:`${n.startTime}–${n.endTime}`})
   if(clean(o.lessonType)!==clean(n.lessonType))push({...base(n),kind:'type',from:o.lessonType,to:n.lessonType})
  }else{
   if(o)push({...base(o),kind:'removed',from:o.lessonType,to:null})
   if(n)push({...base(n),kind:'added',from:null,to:n.lessonType})
  }
 }
 // The same change in both weeks of the pair is a weekly change; otherwise it concerns one of the alternating weeks.
 const merged=new Map<string,{parities:Set<number>;change:Omit<ScheduleChange,'key'|'date'|'weekType'>}>()
 for(const {parity,change} of raw){const id=JSON.stringify(change),entry=merged.get(id);if(entry)entry.parities.add(parity);else merged.set(id,{parities:new Set([parity]),change})}
 return [...merged.values()].map(({parities,change})=>{const parity=parities.size>1?null:[...parities][0];return make({...change,weekType:null,date:nextOccurrence(next,change.weekday!,parity,today)})})
  .sort((x,y)=>(x.date??'9999').localeCompare(y.date??'9999')||(x.weekday??0)-(y.weekday??0)||(x.slot??0)-(y.slot??0))
}

type Row=[string,string,string,string,string,string|null,string|null,string,string|null,number]
export async function saveScheduleNotifications(db:D1Database,accounts:string[],changes:ScheduleChange[],source:{kind:'platonus'|'group';actor?:string|null;unique?:string}){
 if(!accounts.length||!changes.length)return 0
 const now=Date.now(),rows:Row[]=[],summary=changes.length>5,actor=source.actor??null
 const detail=(c:ScheduleChange)=>({...c,text:describeChange(c),when:whenChange(c)})
 for(const account of [...new Set(accounts)].slice(0,300)){
  if(summary){
   const kind=source.kind==='platonus'?'platonus_update':'group_change',subjects=[...new Set(changes.map(c=>c.subject))]
   const body=`${actor?actor+': ':''}${changes.length} ${plural(changes.length)} — ${subjects.slice(0,3).join(', ')}${subjects.length>3?' и др.':''}`
   const date=changes.map(c=>c.date).filter((d):d is string=>!!d).sort()[0]??null
   rows.push(['schedule:'+await hash([account,source.kind,source.unique??'',...changes.map(c=>c.key)].join('|')),account,kind,KIND_TITLES[kind],body,null,date,JSON.stringify({source:source.kind,count:changes.length,changes:changes.slice(0,40).map(detail)}),actor,now])
  }else for(const c of changes){
   const body=source.kind==='platonus'?`${c.subject}: ${describeChange(c)} · ${whenChange(c)}`:`${actor?actor+': ':''}${c.subject} ${whenChange(c)} — ${describeChange(c)}`
   rows.push(['schedule:'+await hash([account,source.kind,source.unique??'',c.key].join('|')),account,c.kind,KIND_TITLES[c.kind],body,c.subject,c.date,JSON.stringify({source:source.kind,...detail(c)}),actor,now])
  }
 }
 const statements=rows.map(row=>db.prepare('INSERT OR IGNORE INTO schedule_notifications(id,account_id,kind,title,body,subject,lesson_date,payload_json,actor,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(...row))
 return tolerate(async()=>{let saved=0;for(let i=0;i<statements.length;i+=50)saved+=(await db.batch(statements.slice(i,i+50))).reduce((sum,r)=>sum+Number(r.meta.changes??0),0);return saved},0)
}
/** Called after a new Platonus snapshot was stored. The very first snapshot never notifies. */
export async function notifyPlatonusChanges(env:Bindings,previous:PlatonusSnapshot|null,next:PlatonusSnapshot){
 if(!previous||!env.REGISTRY||!env.OWNER_ID||env.OWNER_ID.startsWith('group:'))return 0
 const changes=diffPlatonusSchedule(previous,next)
 return saveScheduleNotifications(env.REGISTRY,[env.OWNER_ID],changes,{kind:'platonus'})
}

type Slot={id:string;subjectName:string;teacherName:string|null;weekday:number;slotNumber:number;startTime:string;endTime:string;weekType:'both'|'odd'|'even';lessonType:string|null;building:string|null;room:string|null}
type Override={id:string;scheduleSlotId:string;lessonDate:string;status:string;movedDate:string|null;movedStartTime:string|null;building:string|null;room:string|null}
export type ScheduleState={slots:Slot[];overrides:Override[]}
export function diffGroupSchedule(before:ScheduleState,after:ScheduleState,today=localToday()):ScheduleChange[]{
 const changes:ScheduleChange[]=[],oldSlots=new Map(before.slots.map(s=>[s.id,s])),newSlots=new Map(after.slots.map(s=>[s.id,s]))
 const regular=(s:Slot)=>({subject:s.subjectName,weekday:s.weekday,slot:s.slotNumber,time:s.startTime,weekType:s.weekType,date:null})
 for(const s of after.slots){const o=oldSlots.get(s.id)
  if(!o){changes.push(make({...regular(s),kind:'added',from:null,to:s.lessonType}));continue}
  if(clean(o.teacherName)!==clean(s.teacherName))changes.push(make({...regular(s),kind:'teacher',from:o.teacherName,to:s.teacherName}))
  if(clean(place(o.building,o.room))!==clean(place(s.building,s.room)))changes.push(make({...regular(s),kind:'room',from:place(o.building,o.room),to:place(s.building,s.room)}))
  if(o.weekday!==s.weekday||o.slotNumber!==s.slotNumber||o.startTime!==s.startTime||o.endTime!==s.endTime)changes.push(make({...regular(s),kind:'time',from:`${o.slotNumber} пара ${o.startTime}–${o.endTime}`,to:`${s.slotNumber} пара ${s.startTime}–${s.endTime}`}))
  if(clean(o.lessonType)!==clean(s.lessonType))changes.push(make({...regular(s),kind:'type',from:o.lessonType??'—',to:s.lessonType??'—'}))
 }
 for(const o of before.slots)if(!newSlots.has(o.id))changes.push(make({...regular(o),kind:'removed',from:o.lessonType,to:null}))
 const key=(o:Override)=>`${o.scheduleSlotId}|${o.lessonDate}`,oldOverrides=new Map(before.overrides.map(o=>[key(o),o])),newOverrides=new Map(after.overrides.map(o=>[key(o),o]))
 const dated=(o:Override)=>{const s=newSlots.get(o.scheduleSlotId)??oldSlots.get(o.scheduleSlotId);return s?{subject:s.subjectName,slot:s.slotNumber,time:s.startTime,date:o.lessonDate}:null}
 const special=['cancelled','moved','online']
 for(const n of after.overrides){
  if(n.lessonDate<today&&(n.movedDate??'')<today)continue
  const o=oldOverrides.get(key(n)),info=dated(n),slot=newSlots.get(n.scheduleSlotId)??oldSlots.get(n.scheduleSlotId);if(!info||!slot)continue
  const status=o?.status??'normal',movedTo=`${shortDate(n.movedDate??n.lessonDate)}${n.movedStartTime?` ${n.movedStartTime}`:''}`,wasMovedTo=o?`${shortDate(o.movedDate??o.lessonDate)}${o.movedStartTime?` ${o.movedStartTime}`:''}`:null
  if(n.status==='cancelled'&&status!=='cancelled')changes.push(make({...info,kind:'cancelled',from:null,to:null}))
  else if(n.status==='moved'&&(status!=='moved'||wasMovedTo!==movedTo))changes.push(make({...info,kind:'moved',from:status==='moved'?wasMovedTo:`${shortDate(n.lessonDate)} ${slot.startTime}`,to:movedTo}))
  else if(n.status==='online'&&status!=='online')changes.push(make({...info,kind:'online',from:null,to:null}))
  else if(n.status==='exam'&&status!=='exam')changes.push(make({...info,kind:'type',from:null,to:'экзамен'}))
  else if(special.includes(status)&&!special.includes(n.status))changes.push(make({...info,kind:'restored',from:null,to:null}))
  const room=place(n.building??slot.building,n.room??slot.room),was=place(o?.building??slot.building,o?.room??slot.room)
  if(n.status!=='cancelled'&&n.status!=='online'&&clean(room)!==clean(was))changes.push(make({...info,kind:'room',from:was,to:room}))
 }
 for(const o of before.overrides)if(!newOverrides.has(key(o))&&special.includes(o.status)&&o.lessonDate>=today){const info=dated(o);if(info)changes.push(make({...info,kind:'restored',from:null,to:null}))}
 return changes
}
export const scheduleWritePath=/^\/api\/(?:lesson-overrides(?:\/|$)|catalog(?:\/|$)|actions\/[^/]+\/(?:apply|revert)$|changes\/|assistant$)/
export async function scheduleState(env:Bindings,owner:string):Promise<ScheduleState|null>{
 const from=localToday(),to=addDays(from,180)
 const response=await env.WORKSPACES.get(env.WORKSPACES.idFromName(owner)).fetch(new Request(`https://workspace/api/schedule?from=${from}&to=${to}`,{headers:{'x-campus-owner':owner}}))
 if(!response.ok)return null
 return (await response.json() as {data:ScheduleState}).data
}
const ROLE_LABELS:Record<string,string>={owner:'Староста',head:'Староста',subhead:'Староста подгруппы',member:'Участник'}
/** Notifies the members affected by a group-schedule write. Must never throw into the user's request. */
export async function notifyGroupWrite(env:Bindings,member:GroupMember,scope:string,actor:string,before:ScheduleState|null){
 if(!before)return 0
 const owner=`group:${member.group_id}:${scope}`,after=await scheduleState(env,owner);if(!after)return 0
 const changes=diffGroupSchedule(before,after);if(!changes.length)return 0
 const recipients=(await env.DB.prepare(`SELECT account_id FROM group_members WHERE group_id=? AND account_id<>?${scope==='common'?'':' AND subgroup_id=?'}`).bind(...[member.group_id,actor,...(scope==='common'?[]:[scope])]).all<{account_id:string}>()).results.map(r=>r.account_id)
 if(!recipients.length)return 0
 const row=await env.DB.prepare('SELECT a.login,a.display_name,p.platonus_name,p.platonus_login FROM accounts a LEFT JOIN account_profiles p ON p.account_id=a.id WHERE a.id=?').bind(actor).first<{login:string;display_name:string|null;platonus_name:string|null;platonus_login:string|null}>().catch(()=>null)
 const name=row?studentName({login:row.login,displayName:row.display_name,platonusName:row.platonus_name,platonusLogin:row.platonus_login}).name:null
 return saveScheduleNotifications(env.DB,recipients,changes,{kind:'group',actor:[ROLE_LABELS[member.role]??'Староста',name].filter(Boolean).join(' '),unique:`${scope}|${Date.now()}|${crypto.randomUUID()}`})
}
