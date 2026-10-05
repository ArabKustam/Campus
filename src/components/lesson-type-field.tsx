import {t,useLanguage} from '../lib/language'
export const lessonTypes=['Лекция','Семинар','Практическое занятие','Лабораторная работа','СРС','СРСП','Консультация','Экзамен']
export function LessonTypeField({value,onChange}:{value:string;onChange:(value:string)=>void}){
 useLanguage();return <label className="min-w-0 text-sm">{t("Тип занятия")}<select className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={value} onChange={e=>onChange(e.target.value)}><option value="">{t("Не указан")}</option>{value&&!lessonTypes.includes(value)&&<option value={value}>{value}</option>}{lessonTypes.map(type=><option key={type} value={type}>{t(type)}</option>)}</select></label>}
