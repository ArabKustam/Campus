import {GradeScore} from './grade-score'
import {GradeCalculatorDialog} from './grade-calculator-dialog'
import {useEffect,useState,useRef} from 'react'
import {Menu,RefreshCw,Calculator,GraduationCap} from 'lucide-react'
import {requestApi} from '../lib/api-client'
import {t,useLanguage} from '../lib/language'
import type {Journal,JournalOptions,JournalSubject} from '../lib/journal-types'
import {useAccount} from './auth-gate'
import {gradeSubjectLabel} from '../lib/grade-data'
import {Button} from './ui/button'
import {LoadingState,ErrorState} from './ui/page-state'

const field='mt-1 w-full rounded-md border bg-background px-3 py-2'
export function GradesPage({onMenuClick,onConnect}:{onMenuClick:()=>void;onConnect:()=>void}){
 const language=useLanguage(),{user}=useAccount()
 const [options,setOptions]=useState<JournalOptions|null>(null),[period,setPeriod]=useState<{year:number;term:number}|null>(null),[journal,setJournal]=useState<Journal|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[reload,setReload]=useState(0)
 const [calculatorOpen,setCalculatorOpen]=useState(false)
 const generation=useRef(0),storageKey=`campus-journal-period:${user.id}`
 useEffect(()=>{let active=true;void requestApi<JournalOptions>('/api/platonus/grades/options').then(value=>{
  if(!active)return;setOptions(value)
  let saved:{year?:number;term?:number}={};try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}')}catch{}
  setPeriod({year:value.years.some(y=>y.id===saved.year)?saved.year!:value.defaultYear,term:value.terms.some(t=>t.id===saved.term)?saved.term!:value.defaultTerm})
 }).catch(e=>{if(active){setError(e.message);setBusy(false)}});return()=>{active=false}},[storageKey,reload])
 useEffect(()=>{
  if(!period)return
  localStorage.setItem(storageKey,JSON.stringify(period));const id=++generation.current;setJournal(null);setBusy(true);setError('')
  void requestApi<Journal>(`/api/platonus/grades?year=${period.year}&term=${period.term}`).then(value=>{if(id===generation.current){setJournal(value);setError(value.error??'')}}).catch(e=>{if(id===generation.current)setError(e.message)}).finally(()=>{if(id===generation.current)setBusy(false)})
  return()=>{generation.current++}
 },[period?.year,period?.term,storageKey,reload])
 async function refresh(){const connection=await requestApi<{credentialsSaved:boolean}>('/api/platonus/connection').catch(()=>null);if(connection&&!connection.credentialsSaved){onConnect();return}if(!period){setBusy(true);setReload(n=>n+1);return}const id=++generation.current;setBusy(true);setError('');try{const value=await requestApi<Journal>(`/api/platonus/grades?year=${period.year}&term=${period.term}`,{method:'POST'});if(id===generation.current){setJournal(value);setError(value.error??'');window.dispatchEvent(new Event('campus-notifications-refresh'))}}catch(e){if(id===generation.current)setError(e instanceof Error?e.message:'Ошибка')}finally{if(id===generation.current)setBusy(false)}}
 return <main className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
 <header className="flex items-center gap-3"><Button variant="ghost" size="icon" className="md:hidden" aria-label={t('Открыть меню')} onClick={onMenuClick}><Menu/></Button><GraduationCap className="hidden size-6 text-primary sm:block"/><h1 className="flex-1 text-xl font-semibold">{t('Оценки')}</h1><Button variant="ghost" size="icon" title={t('Обновить данные')} aria-label={t('Обновить данные')} disabled={busy} onClick={()=>void refresh()}><RefreshCw className={busy?'animate-spin':''}/></Button></header>
 {options&&period&&<div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2"><label className="min-w-0 text-sm">{t('Учебный год')}<select className={field} value={period.year} onChange={e=>setPeriod({...period,year:Number(e.target.value)})}>{options.years.map(y=><option key={y.id} value={y.id}>{y.label}</option>)}</select></label><label className="min-w-0 text-sm">{t('Семестр')}<select className={field} value={period.term} onChange={e=>setPeriod({...period,term:Number(e.target.value)})}>{options.terms.map(term=><option key={term.id} value={term.id}>{t(term.label)}</option>)}</select></label></div>}
 <Button size="sm" variant="outline" onClick={()=>setCalculatorOpen(true)}><Calculator className="size-4"/>{t('Калькулятор оценок')}</Button>{calculatorOpen&&<GradeCalculatorDialog subjects={journal?.subjects??[]} onClose={()=>setCalculatorOpen(false)}/>}
 {(error||options?.error)&&<ErrorState message={error||options!.error!}/>}
 {!options&&!busy&&<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>void refresh()}>{t('Попробовать снова')}</Button><Button variant="ghost" onClick={onConnect}>{t('Подключить Platonus')}</Button></div>}
 {busy&&!journal?<LoadingState/>:journal&&<section aria-label={t('Оценки')} aria-busy={busy} className="space-y-3">
 <p className="text-xs text-muted-foreground">{t('Обновлено')}: {new Date(journal.capturedAt).toLocaleString(language==='kk'?'kk-KZ':language==='en'?'en-GB':'ru-RU')}</p>
 {journal.subjects.length===0?<div className="rounded-xl border p-6 text-sm text-muted-foreground">{t('В этом семестре пока нет опубликованных оценок. Выберите другой учебный год или семестр.')}</div>:journal.subjects.map(subject=><article className="min-w-0 rounded-xl border p-4 sm:p-5" key={subject.id}><div className="flex items-center gap-4"><GradeScore label={subject.finalScore.trim()&&subject.finalScore!=='-'?'Итог':'Балл Platonus'} value={subject.finalScore.trim()&&subject.finalScore!=='-'?subject.finalScore:subject.score} large/><div className="min-w-0"><h2 className="break-words font-semibold">{gradeSubjectLabel(subject.name)}</h2>{subject.teacher&&<p className="mt-1 break-words text-xs text-muted-foreground">{subject.teacher}</p>}</div></div><div className="mt-5 grid grid-cols-3 gap-x-3 gap-y-4 border-t pt-4 sm:grid-cols-6">{subject.exams.map((exam,i)=><GradeScore key={i} label={exam.name} value={exam.mark}/>)}</div><SubjectMarks subject={subject} locale={language==='kk'?'kk-KZ':language==='en'?'en-GB':'ru-RU'}/></article>)}
 </section>}


 </main>
}

function markTone(mark:string){const n=Number(mark.replace(',','.'));if(!Number.isFinite(n))return 'bg-muted text-muted-foreground';return n>=90?'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300':n>=75?'bg-blue-500/15 text-blue-700 dark:text-blue-300':n>=50?'bg-amber-500/15 text-amber-700 dark:text-amber-300':'bg-red-500/15 text-red-700 dark:text-red-300'}
function SubjectMarks({subject,locale}:{subject:JournalSubject;locale:string}){
 if(!subject.marks&&!subject.marksError)return null
 const marks=subject.marks??[],numeric=marks.map(m=>Number(m.mark.replace(',','.'))).filter(Number.isFinite),average=numeric.length?Math.round(numeric.reduce((a,b)=>a+b,0)/numeric.length*10)/10:null
 const date=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(value+'T00:00:00').toLocaleDateString(locale,{day:'numeric',month:'short'}):value
 return <details className="mt-4 border-t pt-3" open={marks.length>0&&marks.length<=12}><summary className="cursor-pointer text-sm font-medium">{t('Все оценки по датам')} <span className="text-muted-foreground">· {marks.length}{average!==null?` · ${t('среднее')} ${average}`:''}</span></summary>
 {subject.marksError&&!marks.length?<p className="mt-2 text-xs text-muted-foreground">{subject.marksError}</p>:!marks.length?<p className="mt-2 text-xs text-muted-foreground">{t('Отдельных оценок пока нет.')}</p>:<ul className="mt-3 flex flex-wrap gap-2">{marks.map((m,i)=><li key={i} className="flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs"><span className={`rounded-md px-1.5 py-0.5 font-semibold tabular-nums ${markTone(m.mark)}`}>{m.mark}</span><span className="min-w-0"><span className="block tabular-nums">{m.date?date(m.date):t('Без даты')}</span>{m.type&&<span className="block max-w-40 truncate text-muted-foreground">{m.type}</span>}</span></li>)}</ul>}
 </details>
}
