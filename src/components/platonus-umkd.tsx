import {lazy,Suspense,useState,useEffect} from 'react'
import {Star,BookOpen} from 'lucide-react'
import {UmkdFileCards} from './umkd-file-cards'
import {t,useLanguage} from '../lib/language'
import {useAccount} from './auth-gate'
import {Modal} from './ui/modal'
import {Button} from './ui/button'
import {requestApi} from '../lib/api-client'
import type {StudySection} from '../../bridge/platonus-parser'

const PdfPreview=lazy(()=>import('./pdf-preview').then(m=>({default:m.PdfPreview})))
type FileItem={id:number;name:string;saved?:boolean}

export function PlatonusUmkd({section,apiBase='/api/platonus/umkd'}:{section:StudySection;apiBase?:string}){
 useLanguage()
 const account=useAccount(),favoriteKey=`campus-umkd-favorites-${account?.user.id??'local'}`
 const [favorites,setFavorites]=useState<string[]>(()=>{try{return JSON.parse(localStorage.getItem(favoriteKey)||'[]')}catch{return []}})
 const [onlyFavorites,setOnlyFavorites]=useState(false),[query,setQuery]=useState('')
 const [course,setCourse]=useState<{id:string;title:string}|null>(null),[files,setFiles]=useState<FileItem[]>([]),[file,setFile]=useState<FileItem|null>(null)
 const [versions,setVersions]=useState<{key:string;capturedAt:string;bytes:number}[]>([]),[version,setVersion]=useState('')
 useEffect(()=>{let active=true;setVersion('');setVersions([]);if(course&&file)void requestApi<{key:string;capturedAt:string;bytes:number}[]>(`${apiBase}/${course.id}/files/${file.id}/versions`).then(v=>{if(active)setVersions(v)}).catch(()=>{});return()=>{active=false}},[course?.id,file?.id,apiBase])
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 async function open(id:string,title:string){
  setCourse({id,title});setFiles([]);setFile(null);setError('');setBusy(true)
  try{setFiles(await requestApi<FileItem[]>(`${apiBase}/${id}/files`))}
  catch(e){setError(e instanceof Error?e.message:t('Не удалось получить файлы'))}
  finally{setBusy(false)}
 }
 const url=course&&file?`${apiBase}/${course.id}/files/${file.id}${version?'?version='+encodeURIComponent(version):''}`:null
 const visible=section.links.filter(link=>(!onlyFavorites||favorites.includes(link.url))&&link.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a,b)=>Number(favorites.includes(b.url))-Number(favorites.includes(a.url))||a.title.localeCompare(b.title,'ru'))
 return <section className="space-y-4">
  {section.error&&<p role="alert" className="text-sm text-destructive">{section.error}</p>}
  <div className="flex items-center gap-3"><input type="search" value={query} onChange={e=>setQuery(e.target.value)} aria-label={t('Поиск по дисциплинам УМКД')} placeholder={t('Найти предмет…')} className="h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm"/><Button type="button" variant={onlyFavorites?'default':'outline'} aria-pressed={onlyFavorites} className="h-11 shrink-0" onClick={()=>setOnlyFavorites(v=>!v)}><Star className={onlyFavorites?'size-4 fill-current':'size-4'}/>{t('Избранное')}</Button></div>
  <div className="space-y-2">{visible.map(link=>{const id=link.url.match(/studentUmkd\/(\d+)$/)?.[1];if(!id)return null;const favorite=favorites.includes(link.url);return <div key={id} className="flex min-w-0 items-center gap-2 rounded-lg border bg-card p-2"><Button variant={course?.id===id?'default':'ghost'} disabled={busy} className="h-auto flex-1 justify-start whitespace-normal break-words p-3 text-left" onClick={()=>void open(id,link.title)}><BookOpen className="size-4 shrink-0"/><span className="min-w-0">{link.title.replace(/\s*\(\s*\)$/,'')}</span></Button><Button variant="ghost" size="icon" className="shrink-0" aria-label={favorite?t('Убрать из избранного'):t('Добавить в избранное')} aria-pressed={favorite} onClick={()=>setFavorites(old=>{const next=old.includes(link.url)?old.filter(value=>value!==link.url):[...old,link.url];localStorage.setItem(favoriteKey,JSON.stringify(next));return next})}><Star className={favorite?'size-4 fill-current':'size-4'}/></Button></div>})}</div>
  {section.links.length>0&&!visible.length&&<p className="text-sm text-muted-foreground">{t('Предметы не найдены.')}</p>}
  {!section.links.length&&<p className="text-sm text-muted-foreground">{t('Материалов пока нет.')}</p>}
  {course&&<Modal wide title={file?.name??course.title} onClose={()=>file?setFile(null):setCourse(null)}><section className="space-y-3">
   {file&&<Button variant="outline" onClick={()=>setFile(null)}>{t('Назад к документам')}</Button>}
   {busy&&<p role="status">{t('Загрузка…')}</p>}
   {error&&<div role="alert"><p className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={()=>void open(course.id,course.title)}>{t('Повторить')}</Button></div>}
   {!file&&<UmkdFileCards key={course.id} files={files} onOpen={setFile}/>} 
   {!busy&&!error&&!files.length&&<p className="text-sm text-muted-foreground">{t('Файлов пока нет.')}</p>}
   {url&&<>{versions.length>1&&<label className="flex flex-wrap items-center gap-2 rounded-lg bg-muted p-3 text-sm">Версия документа<select aria-label="Версия документа" className="max-w-full rounded-md border bg-background p-2" value={version} onChange={e=>setVersion(e.target.value)}><option value="">Последняя</option>{versions.map(v=><option key={v.key} value={v.key}>{new Date(v.capturedAt).toLocaleString('ru-RU')} · {(v.bytes/1024).toFixed(0)} КБ</option>)}</select></label>}<div className="flex flex-wrap gap-4 text-sm"><a href={url} target="_blank" rel="noreferrer" className="text-primary underline">{t('Открыть в новой вкладке')}</a><a href={url+(version?'&':'?')+'download=1'} className="text-primary underline">{t('Скачать')}</a></div><Suspense fallback={<p role="status" className="text-sm">{t('Открываем…')}</p>}><PdfPreview key={url} url={url} title={file!.name}/></Suspense></>}
  </section></Modal>}
 </section>
}
