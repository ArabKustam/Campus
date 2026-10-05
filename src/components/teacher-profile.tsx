import {t,useLanguage} from '../lib/language'
import {scopedAssetUrl} from '../lib/api-client'
import { useCallback,useEffect,useRef,useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { requestApi } from '../lib/api-client'
import { useDialogFocus } from '../hooks/use-dialog-focus'
import { Button } from './ui/button'
import { LoadingState } from './ui/page-state'
type Data={candidates:{name:string;url:string}[];searchUrl:string;profile:{name:string;text:string;photo:string|null;url:string;fetchedAt:string}|null}
export function TeacherLink({id,name}:{id?:string|null;name:string}){
 useLanguage();
 const [open,setOpen]=useState(false)
 return <><button type="button" disabled={!id} className="inline text-left underline decoration-dotted underline-offset-4 hover:text-primary disabled:no-underline" onClick={e=>{e.stopPropagation();setOpen(true)}}>{name}</button>{open&&id&&createPortal(<TeacherProfile id={id} name={name} onClose={()=>setOpen(false)}/>,document.body)}</>
}
function TeacherProfile({id,name,onClose}:{id:string;name:string;onClose:()=>void}){
 useLanguage();
 const panel=useRef<HTMLDivElement>(null),[data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[photoFailed,setPhotoFailed]=useState(false)
 useDialogFocus(panel,true,onClose)
 const load=useCallback(async(url?:string)=>{setBusy(true);setError('');try{setPhotoFailed(false);setData(await requestApi<Data>(`/api/teachers/${encodeURIComponent(id)}/profile${url?`?url=${encodeURIComponent(url)}`:''}`))}catch(e){setError(e instanceof Error?e.message:'Ошибка загрузки')}finally{setBusy(false)}},[id])
 useEffect(()=>{void load()},[load])
 return <div className="fixed inset-0 z-[100] flex justify-end bg-black/40" onClick={e=>{e.stopPropagation();if(e.target===e.currentTarget)onClose()}}><div ref={panel} role="dialog" aria-modal="true" aria-label={`Преподаватель: ${name}`} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose()}}} className="h-dvh w-full max-w-xl space-y-5 overflow-y-auto bg-background p-5 shadow-xl"><header className="flex items-start justify-between gap-3"><div><h2 className="break-words text-lg font-semibold">{data?.profile?.name||name}</h2><p className="mt-1 text-xs text-muted-foreground">Персональная страница КарТУ</p></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="Закрыть карточку преподавателя"><X/></Button></header>{busy&&<LoadingState/>}{error&&<div role="alert" className="space-y-2 text-sm"><p>{error}</p><Button variant="outline" onClick={()=>void load()}>{t("Повторить")}</Button></div>}{data?.profile?<>{data.profile.photo&&!photoFailed&&<img src={scopedAssetUrl(`/api/teachers/${encodeURIComponent(id)}/photo?profile=${encodeURIComponent(data.profile.url)}`)} referrerPolicy="no-referrer" alt={data.profile.name} className="max-h-72 max-w-full rounded-lg object-contain" onError={()=>setPhotoFailed(true)}/>}{photoFailed&&<p role="status" className="text-sm text-muted-foreground">Фото пока недоступно. <button className="underline" onClick={()=>setPhotoFailed(false)}>Повторить загрузку</button></p>}<p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{data.profile.text||'На странице нет текстового описания.'}</p><a href={data.profile.url} target="_blank" rel="noreferrer" className="inline-block text-sm text-primary underline">Оригинал на person.kstu.kz</a><p className="text-xs text-muted-foreground">Загружено {new Date(data.profile.fetchedAt).toLocaleString('ru-RU')}. Данные публикует университет; кабинет в профиле может отличаться от кабинета занятия.</p></>:data&&<><p className="text-sm">{data.candidates.length?'Найдено несколько совпадений. Выберите преподавателя:':'Точного совпадения по фамилии и инициалам не найдено. Проверьте имя в редакторе преподавателей.'}</p>{data.candidates.map(candidate=><Button key={candidate.url} variant="outline" disabled={busy} onClick={()=>void load(candidate.url)}>{candidate.name}</Button>)}<a className="block text-sm text-primary underline" href={data.searchUrl} target="_blank" rel="noreferrer">Поиск на сайте университета</a></>}</div></div>
}
