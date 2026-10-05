import type {PlatonusSnapshot,StudyTable} from '../../bridge/platonus-parser'
// Platonus appends catalog codes to names; prefer journal names to keep exact mark matching.
function subjectKey(name:string){return name.normalize('NFC').replace(/\s*\((?:[A-Za-z][A-Za-z0-9 ()-]*\d{3,6})?\)\s*$/,'').trim().toLocaleLowerCase()}
export function gradeSubjects(snapshot:PlatonusSnapshot|null){
 const result:string[]=[],seen=new Set<string>()
 for(const section of [snapshot?.grades,snapshot?.umkd]){
  const batch:string[]=[]
  for(const table of section?.tables??[]){const column=table.headers.indexOf('Предмет');if(column>=0)batch.push(...table.rows.map(row=>row[column]).filter(Boolean))}
  // Keep distinct journal records even when their visible subject names resemble each other.
  for(const name of [...new Set(batch)])if(!seen.has(subjectKey(name)))result.push(name)
  batch.forEach(name=>seen.add(subjectKey(name)))
 }
 for(const lesson of snapshot?.lessons??[])if(!seen.has(subjectKey(lesson.subject))){result.push(lesson.subject);seen.add(subjectKey(lesson.subject))}
 return result
}
export function gradeSubjectLabel(subject:string){return subject.replace(/\s*\(\)\s*$/,'')}
export function publishedMarks(tables:StudyTable[],subject:string){
 return tables.flatMap(table=>{const column=table.headers.indexOf('Предмет'),marks=table.headers.map((h,i)=>h==='Оценка'?i:-1).filter(i=>i>=0)
  return column<0?[]:table.rows.filter(row=>row[column]===subject).flatMap(row=>marks.map(i=>row[i]).filter(value=>/^\d+(?:[.,]\d+)?$/.test(value??'')).map(value=>Number(value.replace(',','.'))).filter(n=>n>=0&&n<=100))
 })
}
export function hasPublishedGrade(tables:StudyTable[],subject:string){
 return tables.some(table=>{const column=table.headers.indexOf('Предмет'),scores=table.headers.map((header,index)=>/^(Оценка|Рейтинг(?: \d+)?|Экзамен|Итог)$/.test(header)?index:-1).filter(index=>index>=0)
  return column>=0&&table.rows.some(row=>row[column]===subject&&scores.some(index=>Boolean(row[index]?.trim())&&!['—','-'].includes(row[index].trim())))
 })
}
