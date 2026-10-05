import {useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {X} from 'lucide-react'
import {useDialogFocus} from '../hooks/use-dialog-focus'
import {t,useLanguage} from '../lib/language'
import {Button} from './ui/button'
import {requiredExam,ratingFor} from '../lib/grade-plan'
import type {JournalSubject} from '../lib/journal-types'
export function GradeCalculatorDialog({onClose,subjects=[]}:{onClose:()=>void;subjects?:JournalSubject[]}){
 useLanguage();const panel=useRef<HTMLDivElement>(null);useDialogFocus(panel,true,onClose)
 const initial=subjects.find(s=>s.exams.some(e=>/экз|exam/i.test(e.name)))??subjects[0]
 const [selected,setSelected]=useState(String(initial?.id??'')),[rating,setRating]=useState(()=>ratingFor(initial)),[target,setTarget]=useState(75),[weight,setWeight]=useState('40')
 const subject=subjects.find(s=>String(s.id)===selected),original=ratingFor(subject),w=Number(weight)
 const hasExam=!subject||subject.exams.some(e=>/экз|exam/i.test(e.name))
 const result=!hasExam||rating.trim()===''||weight.trim()===''?null:requiredExam(Number(rating),target,w)
 const needed=result===null?null:Math.ceil(result*100)/100
 const maximum=rating!==''&&w>0&&w<=100?Number(rating)*(1-w/100)+w:null
 const field='mt-1 w-full rounded-md border bg-background px-3 py-2'
 return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3" onClick={e=>{if(e.currentTarget===e.target)onClose()}}><div ref={panel} role="dialog" aria-modal="true" aria-label={t('Калькулятор оценок')} className="max-h-[90dvh] w-full max-w-lg space-y-5 overflow-y-auto rounded-xl border bg-background p-5 shadow-xl"><header className="flex items-center gap-3"><h2 className="flex-1 text-lg font-semibold">{t('Что нужно получить на экзамене?')}</h2><Button variant="ghost" size="icon" aria-label={t('Закрыть')} onClick={onClose}><X/></Button></header>
 <label className="block text-sm">{t('1. Выберите предмет')}<select className={field} value={selected} onChange={e=>{setSelected(e.target.value);setRating(ratingFor(subjects.find(s=>String(s.id)===e.target.value)))}}><option value="">{t('Ввести данные вручную')}</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
 <div><label className="block text-sm">{t('2. Ваш рейтинг за семестр')}<input type="number" min="0" max="100" step="0.01" className={field} value={rating} placeholder="0–100" onChange={e=>setRating(e.target.value)}/></label><p className="mt-2 text-xs text-muted-foreground">{t(original!==''&&rating===original?'Подставлено из поля «Рейтинг» в Platonus.':original!==''?'Вы изменили рейтинг для прогноза. Оценки в Platonus не меняются.':'Рейтинг пока не опубликован. Введите предполагаемый балл от 0 до 100.')}</p></div>
 <fieldset className="space-y-2"><legend className="text-sm">{t('3. Какую итоговую оценку хотите?')}</legend><div className="grid grid-cols-3 gap-2">{[[3,50],[4,75],[5,90]].map(([grade,score])=><Button key={grade} variant={target===score?'default':'outline'} aria-pressed={target===score} onClick={()=>setTarget(score)}>{grade} · {score}+</Button>)}</div></fieldset>
 <div role="status" className="space-y-2 rounded-xl bg-primary/10 p-4">{!hasExam?<p>{t('У этого предмета нет экзамена в журнале. Выберите другой предмет или ручной ввод, если знаете формулу оценки.')}</p>:needed===null?<p>{t('Введите рейтинг — результат появится сразу.')}</p>:needed>100?<><h3 className="font-semibold">{t('Одного экзамена не хватит')}</h3><p className="text-sm">{t('Даже со 100 баллами на экзамене итог составит')}: {maximum?.toFixed(2)} / 100.</p>{w<100&&<p className="text-sm">{t('Чтобы достичь цели, рейтинг за семестр должен быть не ниже')}: {Math.ceil((target-w)/(1-w/100)*100)/100}.</p>}</>:<><p>{t('На экзамене нужно не меньше')}</p><strong className="text-3xl tabular-nums">{needed} <span className="text-base font-normal">/ 100</span></strong><p className="text-sm">{t('Тогда итоговый балл будет не ниже')}: {target}.</p></>}</div>
 <p className="text-xs leading-relaxed text-muted-foreground">{t('Формула прогноза')}: {t('Рейтинг')} × {100-w}% + {t('Экзамен')} × {w}%. {t('Проверьте веса в силлабусе: для вашего предмета они могут отличаться.')}</p>
 <details className="text-sm"><summary className="cursor-pointer text-primary">{t('Изменить формулу расчёта')}</summary><label className="mt-3 block">{t('Вес экзамена, %')}<input type="number" min="1" max="100" className={field} value={weight} onChange={e=>setWeight(e.target.value)}/></label><p className="mt-2 text-xs text-muted-foreground">{t('Вес рейтинга')}: {Number.isFinite(w)?100-w:'—'}%. {t('Количество будущих работ неизвестно, поэтому оценки за отдельные задания не подставляются.')}</p></details>
 </div></div>,document.body)
}
