import {t} from '../lib/language'
export function GradeScore({label,value,large=false}:{label:string;value:string;large?:boolean}){
 const clean=value.replace(/&nbsp;|&#160;/gi,' ').trim(),number=Number(clean.replace(',','.'))
 const numeric=clean!==''&&Number.isFinite(number)&&number>=0&&number<=100
 const color=!numeric?'text-muted-foreground':number>=75?'text-emerald-600 dark:text-emerald-400':number>=50?'text-amber-600 dark:text-amber-400':'text-rose-600 dark:text-rose-400'
 return <div className={`flex flex-col items-center gap-1.5 text-center ${large?'w-20 shrink-0':'min-w-0'}`}><div className={`relative shrink-0 ${large?'size-20':'size-14'} ${color}`}><svg aria-hidden="true" viewBox="0 0 64 64" className="size-full -rotate-90"><circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="3" className="text-border"/>{numeric&&<circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray={`${number} 100`}/>}</svg><span className={`absolute inset-0 flex items-center justify-center font-semibold tabular-nums ${large?'text-xl':'text-xs'}`}>{numeric?String(Math.round(number*100)/100):clean||'—'}</span></div><span className="max-w-24 break-words text-xs text-muted-foreground">{t(label)}</span></div>
}
