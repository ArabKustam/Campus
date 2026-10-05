import type {JournalSubject} from './journal-types'
/** Equal-weight forecast; never interprets missing published marks as zero. */
export function requiredAverage(average:number,count:number,remaining:number,target:number):number|null{
 if(![average,count,remaining,target].every(Number.isFinite)||average<0||average>100||target<0||target>100||count<0||!Number.isInteger(count)||remaining<1||!Number.isInteger(remaining))return null
 return Math.max(0,(target*(count+remaining)-average*count)/remaining)
}
export function requiredExam(rating:number,target:number,examWeight:number):number|null{
 if(![rating,target,examWeight].every(Number.isFinite)||rating<0||rating>100||target<0||target>100||examWeight<=0||examWeight>100)return null
 return Math.max(0,(target-rating*(1-examWeight/100))/(examWeight/100))
}

export function ratingFor(subject?:JournalSubject){const raw=subject?.exams.find(e=>e.name.trim().toLowerCase()==='рейтинг')?.mark?.trim();if(!raw||!/^\d+(?:[.,]\d+)?$/.test(raw))return '';const n=Number(raw.replace(',','.'));return n>=0&&n<=100?String(n):''}
