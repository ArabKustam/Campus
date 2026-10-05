import {BookOpen,NotebookPen,Presentation,ClipboardCheck,FileText} from 'lucide-react'
type Item={id:number;name:string;saved?:boolean}
function category(name:string){
 if(/силл?аб|рабоч.*программ/iu.test(name))return {title:'Силлабус',hint:'Темы курса, требования и система оценивания',Icon:NotebookPen,color:'bg-red-500/10 text-red-600 dark:text-red-300'}
 if(/конспект|лекци/iu.test(name))return {title:'Лекции',hint:'Теория, основные понятия и объяснения',Icon:BookOpen,color:'bg-blue-500/10 text-blue-600 dark:text-blue-300'}
 if(/семинар|практич/iu.test(name))return {title:'Семинары и практика',hint:'Планы занятий, вопросы и упражнения',Icon:Presentation,color:'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}
 if(/контрол|рубеж|итог|тест/iu.test(name))return {title:'Контроль и экзамен',hint:'Материалы для проверки знаний и подготовки',Icon:ClipboardCheck,color:'bg-violet-500/10 text-violet-600 dark:text-violet-300'}
 return {title:name,hint:'Учебный документ',Icon:FileText,color:'bg-muted text-muted-foreground'}
}
export function UmkdFileCards({files,onOpen}:{files:Item[];onOpen:(f:Item)=>void}){
 return <div className="grid gap-3 sm:grid-cols-2">{files.map(f=>{const item=category(f.name);return <button key={f.id} title={f.name} onClick={()=>onOpen(f)} className="group flex items-center gap-4 rounded-xl border bg-card p-4 text-left hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:flex-col sm:items-start"><span aria-hidden="true" className={`flex size-16 shrink-0 items-center justify-center rounded-xl ${item.color}`}><item.Icon className="size-9 stroke-[1.5]"/></span><span className="min-w-0"><strong className="block break-words text-sm">{item.title}</strong><span className="mt-1 block text-xs text-muted-foreground">{item.hint}</span></span></button>})}</div>
}
