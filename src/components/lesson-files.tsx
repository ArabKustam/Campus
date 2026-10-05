import {useCallback,useEffect,useId,useRef,useState} from 'react'
import {BookMarked,Camera,Check,ExternalLink,FileText,Image as ImageIcon,Link2,Loader2,Paperclip,Pencil,Plus,Trash2,Upload,X} from 'lucide-react'
import {ATTACHMENT_ACCEPT,MAX_ATTACHMENT_BYTES,campusApi,dueAtForDate,formatDueDate,type AttachmentInfo,type AttachmentOwnerType,type HomeworkItem,type MaterialItem} from '../lib/campus-api'
import {t,useLanguage} from '../lib/language'
import {cn} from '../lib/utils'
import {Button} from './ui/button'

const inputClass='h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-blue-300 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-500/20'
const areaClass='min-h-[72px] w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground focus:border-blue-300 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-500/20'
const errorText=(error:unknown)=>error instanceof Error?error.message:t('Не удалось сохранить')
export const fileSize=(bytes:number)=>bytes<1024*1024?`${Math.max(1,Math.round(bytes/1024))} ${t('КБ')}`:`${(bytes/1024/1024).toFixed(1).replace('.',',')} ${t('МБ')}`
export const addDaysKey=(date:string,days:number)=>{const [y,m,d]=date.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+days)).toISOString().slice(0,10)}
const isImage=(file:{contentType:string})=>file.contentType.startsWith('image/')

/** Кнопка удаления с подтверждением прямо на месте (без системного confirm). */
export function ConfirmDelete({label,onConfirm,compact=false}:{label:string;onConfirm:()=>Promise<unknown>|void;compact?:boolean}){
 useLanguage();const [asking,setAsking]=useState(false),[busy,setBusy]=useState(false)
 if(!asking)return <Button type="button" variant="ghost" size={compact?'sm':'icon'} className={compact?'h-8 w-8 p-0':'h-9 w-9'} aria-label={label} title={label} onClick={()=>setAsking(true)}><Trash2/></Button>
 return <span className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/5 px-1.5 py-1 text-xs"><span className="px-1 text-destructive">{t('Удалить?')}</span><Button type="button" size="sm" variant="outline" className="h-7 px-2 text-destructive" disabled={busy} onClick={()=>{setBusy(true);void Promise.resolve(onConfirm()).finally(()=>{setBusy(false);setAsking(false)})}}>{busy?<Loader2 className="animate-spin"/>:t('Да')}</Button><Button type="button" size="sm" variant="ghost" className="h-7 px-2" disabled={busy} onClick={()=>setAsking(false)}>{t('Нет')}</Button></span>
}

function Thumb({file}:{file:AttachmentInfo}){
 const [failed,setFailed]=useState(false)
 return failed?<span className="grid size-full place-items-center bg-muted text-muted-foreground"><ImageIcon className="size-6"/></span>:<img src={campusApi.attachmentUrl(file.id)} alt={file.fileName} loading="lazy" onError={()=>setFailed(true)} className="size-full object-cover"/>
}

/** Вложения: изображения — миниатюрами, остальные файлы — строками. */
export function AttachmentList({files,onDelete}:{files:AttachmentInfo[];onDelete?:(file:AttachmentInfo)=>Promise<unknown>}){
 useLanguage();if(!files.length)return null
 const images=files.filter(isImage),other=files.filter(file=>!isImage(file))
 return <div className="mt-2 space-y-2">
  {images.length>0&&<ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">{images.map(file=><li key={file.id} className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted"><a href={campusApi.attachmentUrl(file.id)} target="_blank" rel="noreferrer" className="block size-full" aria-label={`${t('Открыть')} ${file.fileName}`}><Thumb file={file}/></a>{onDelete&&<span className="absolute right-1 top-1 rounded-md bg-background/90 shadow-sm"><ConfirmDelete compact label={`${t('Удалить файл')} ${file.fileName}`} onConfirm={()=>onDelete(file)}/></span>}</li>)}</ul>}
  {other.map(file=><div key={file.id} className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"><FileText className="size-4 shrink-0 text-primary"/><a href={campusApi.attachmentUrl(file.id)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 text-xs hover:underline"><span className="block truncate font-medium text-foreground">{file.fileName}</span><span className="text-[11px] text-muted-foreground">{fileSize(file.byteSize)} · {t('открыть')}</span></a>{onDelete&&<ConfirmDelete compact label={`${t('Удалить файл')} ${file.fileName}`} onConfirm={()=>onDelete(file)}/>}</div>)}
 </div>
}

type UploadItem={key:string;name:string;share:number;error?:string}
/** Очередь загрузки с прогрессом по каждому файлу. Возвращает число успешно загруженных. */
export function useUploads(){
 const [items,setItems]=useState<UploadItem[]>([])
 const run=useCallback(async(ownerType:AttachmentOwnerType,ownerId:string|((file:File)=>Promise<string>),files:File[])=>{
  let done=0
  for(const file of files){
   const key=`${file.name}-${file.size}-${Math.random()}`,patch=(value:Partial<UploadItem>)=>setItems(list=>list.map(item=>item.key===key?{...item,...value}:item))
   setItems(list=>[...list,{key,name:file.name,share:0}])
   if(file.size>MAX_ATTACHMENT_BYTES){patch({error:t('Больше 20 МБ — не загружен')});continue}
   try{const id=typeof ownerId==='string'?ownerId:await ownerId(file);await campusApi.uploadFile(ownerType,id,file,share=>patch({share}));done++;setItems(list=>list.filter(item=>item.key!==key))}
   catch(error){patch({error:errorText(error)})}
  }
  return done
 },[])
 const dismiss=(key:string)=>setItems(list=>list.filter(item=>item.key!==key))
 return {items,run,dismiss,busy:items.some(item=>!item.error)}
}
export function UploadStatus({items,onDismiss}:{items:UploadItem[];onDismiss:(key:string)=>void}){
 useLanguage();if(!items.length)return null
 return <ul className="mt-2 space-y-1.5" aria-live="polite">{items.map(item=><li key={item.key} className={cn('rounded-md border px-2.5 py-1.5 text-xs',item.error?'border-destructive/40 bg-destructive/5':'border-border bg-card')}>
  <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate">{item.name}</span>{item.error?<button type="button" className="rounded p-0.5 text-muted-foreground hover:bg-muted" aria-label={t('Скрыть')} onClick={()=>onDismiss(item.key)}><X className="size-3.5"/></button>:<span className="tabular-nums text-muted-foreground">{Math.round(item.share*100)}%</span>}</div>
  {item.error?<p role="alert" className="mt-0.5 text-destructive">{item.error}</p>:<div className="mt-1 h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${t('Загрузка')} ${item.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.share*100)}><div className="h-full bg-primary transition-[width]" style={{width:`${Math.max(4,item.share*100)}%`}}/></div>}
 </li>)}</ul>
}

/** Зона выбора файлов: перетаскивание, выбор и камера на телефоне. */
export function FilePicker({onFiles,disabled,label}:{onFiles:(files:File[])=>void;disabled?:boolean;label?:string}){
 useLanguage();const id=useId(),[over,setOver]=useState(false)
 const take=(list:FileList|null)=>{const files=Array.from(list??[]);if(files.length)onFiles(files)}
 return <div onDragOver={event=>{if(disabled)return;event.preventDefault();setOver(true)}} onDragLeave={()=>setOver(false)} onDrop={event=>{event.preventDefault();setOver(false);if(!disabled)take(event.dataTransfer.files)}} className={cn('flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground transition-colors',over&&'border-primary bg-primary/5',disabled&&'opacity-60')}>
  <Paperclip className="size-4 shrink-0"/><span className="min-w-0 flex-1">{label??t('Перетащите файлы сюда или выберите')}</span>
  <label htmlFor={`${id}-files`} className={cn('inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2.5 font-medium text-foreground hover:bg-accent focus-within:ring-2 focus-within:ring-ring',disabled&&'pointer-events-none')}><Upload className="size-3.5"/>{t('Файлы')}<input id={`${id}-files`} type="file" multiple accept={ATTACHMENT_ACCEPT} disabled={disabled} className="sr-only" onChange={event=>{take(event.target.files);event.target.value=''}}/></label>
  <label htmlFor={`${id}-camera`} className={cn('inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2.5 font-medium text-foreground hover:bg-accent focus-within:ring-2 focus-within:ring-ring md:hidden',disabled&&'pointer-events-none')}><Camera className="size-3.5"/>{t('Камера')}<input id={`${id}-camera`} type="file" accept="image/*" capture="environment" disabled={disabled} className="sr-only" onChange={event=>{take(event.target.files);event.target.value=''}}/></label>
 </div>
}

type LessonRef={slotId:string;subjectId?:string;date:string}
const nextLessonCache=new Map<string,Promise<string>>()
/** Следующее занятие этой же пары: ищем её в ближайшие недели (учитывается чётность недели). */
function nextLessonDate(slot:string,from:string){
 const key=`${slot}|${from}`
 if(!nextLessonCache.has(key))nextLessonCache.set(key,(async()=>{for(const step of [7,14,21,28]){const date=addDaysKey(from,step);try{const day=await campusApi.scheduleDay(date);if(day.lessons.some(lesson=>lesson.scheduleSlotId===slot&&(!lesson.originalDate||lesson.originalDate===date)))return date}catch{/* пробуем следующую неделю */}}return addDaysKey(from,7)})())
 return nextLessonCache.get(key)!
}

/** Домашнее задание к конкретному занятию: список, отметка, правка, удаление и быстрое добавление с файлами. */
export function LessonHomework({lesson,readOnly,onChanged}:{lesson:LessonRef;readOnly:boolean;onChanged?:(openCount:number)=>void}){
 useLanguage()
 const [items,setItems]=useState<HomeworkItem[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [title,setTitle]=useState(''),[details,setDetails]=useState(''),[showDetails,setShowDetails]=useState(false),[due,setDue]=useState<'this'|'next'|'custom'>('this'),[nextDate,setNextDate]=useState(''),[customDate,setCustomDate]=useState(lesson.date),[pending,setPending]=useState<File[]>([]),[saving,setSaving]=useState(false),[editing,setEditing]=useState<string|null>(null)
 const uploads=useUploads(),changed=useRef(onChanged);changed.current=onChanged
 const load=useCallback(async()=>{const rows=(await campusApi.lessonHomework(lesson.slotId,lesson.date)).filter(item=>item.status!=='archived');setItems(rows);changed.current?.(rows.filter(item=>item.status!=='done').length)},[lesson.slotId,lesson.date])
 useEffect(()=>{let active=true;setLoading(true);setError('');load().catch(e=>{if(active)setError(errorText(e))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[load])
 useEffect(()=>{if(due==='next'&&!nextDate)void nextLessonDate(lesson.slotId,lesson.date).then(setNextDate)},[due,nextDate,lesson.slotId,lesson.date])
 const targetDate=due==='this'?lesson.date:due==='next'?nextDate:customDate
 async function create(){
  if(!title.trim()||!lesson.subjectId||!targetDate)return
  setSaving(true);setError('');setNotice('')
  try{
   const created=await campusApi.createHomework({subjectId:lesson.subjectId,scheduleSlotId:lesson.slotId,title:title.trim(),description:details.trim()||null,dueAt:dueAtForDate(targetDate)}) as HomeworkItem
   const files=pending;setTitle('');setDetails('');setShowDetails(false);setPending([])
   if(files.length)await uploads.run('homework',created.id,files)
   if(targetDate!==lesson.date)setNotice(`${t('Задание добавлено к занятию')} ${formatDueDate(targetDate)}`)
   setDue('this');await load()
  }catch(e){setError(errorText(e))}finally{setSaving(false)}
 }
 const act=async(work:Promise<unknown>)=>{setError('');try{await work;await load()}catch(e){setError(errorText(e))}}
 const chip=(value:typeof due,label:string)=><button type="button" aria-pressed={due===value} onClick={()=>setDue(value)} className={cn('h-8 rounded-full border px-3 text-xs font-medium transition-colors',due===value?'border-primary bg-primary text-primary-foreground':'border-border bg-card text-foreground hover:bg-accent')}>{label}</button>
 return <section className="border-b border-border px-5 py-5" aria-labelledby="lesson-homework-title">
  <div className="flex items-center justify-between gap-2"><h3 id="lesson-homework-title" className="text-sm font-semibold text-foreground">{t('Домашнее задание')}</h3><span className="text-[10px] text-muted-foreground">{t('К этому занятию')}</span></div>
  {loading?<p role="status" className="mt-2 text-sm text-muted-foreground">{t('Загрузка…')}</p>:items.length?<ul className="mt-3 space-y-2">{items.map(item=>editing===item.id?<HomeworkEditor key={item.id} item={item} onCancel={()=>{setEditing(null);void load().catch(()=>{})}} onSaved={async()=>{setEditing(null);await load()}}/>:<li key={item.id} className="rounded-lg border border-border bg-card p-3">
   <div className="flex items-start gap-2.5">
    <button type="button" role="checkbox" aria-checked={item.status==='done'} aria-label={item.status==='done'?t('Вернуть в работу'):t('Отметить выполненным')} onClick={()=>void act(campusApi.patchHomework(item.id,{status:item.status==='done'?'open':'done'}))} className={cn('relative mt-0.5 grid size-5 shrink-0 place-items-center rounded border transition-colors before:absolute before:-inset-3 before:content-[""]',item.status==='done'?'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500':'border-input bg-background hover:border-primary')}>{item.status==='done'&&<Check className="size-3.5"/>}</button>
    <div className="min-w-0 flex-1"><p className={cn('break-words text-sm font-medium text-foreground',item.status==='done'&&'text-muted-foreground line-through')}>{item.title}</p>{item.description&&<p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">{item.description}</p>}</div>
    {!readOnly&&<div className="-mr-1 -mt-1 flex shrink-0 items-center"><Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`${t('Изменить')} ${item.title}`} onClick={()=>setEditing(item.id)}><Pencil/></Button><ConfirmDelete compact label={`${t('Удалить задание')} ${item.title}`} onConfirm={()=>act(campusApi.deleteHomework(item.id))}/></div>}
   </div>
   <AttachmentList files={item.attachments??[]} onDelete={readOnly?undefined:file=>act(campusApi.deleteAttachment(file.id))}/>
  </li>)}</ul>:<p className="mt-2 text-sm text-muted-foreground">{t('Заданий к этой паре нет.')}</p>}
  {error&&<p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
  {notice&&<p role="status" className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">{notice}</p>}
  {!readOnly&&lesson.subjectId&&<form className="mt-4 space-y-2.5 rounded-lg border border-border bg-muted/30 p-3" onSubmit={event=>{event.preventDefault();void create()}}>
   <label htmlFor="homework-title" className="sr-only">{t('Что задали')}</label>
   <div className="flex gap-2"><input id="homework-title" className={inputClass} value={title} maxLength={300} placeholder={t('Что задали? Например, задачи 1–5')} onChange={event=>setTitle(event.target.value)}/><Button type="submit" className="h-10 shrink-0" disabled={saving||!title.trim()||!targetDate} aria-label={t('Добавить задание')}>{saving?<Loader2 className="animate-spin"/>:<Plus/>}<span className="hidden sm:inline">{t('Добавить')}</span></Button></div>
   {showDetails?<><label htmlFor="homework-details" className="sr-only">{t('Подробности')}</label><textarea id="homework-details" className={areaClass} value={details} maxLength={10000} placeholder={t('Подробности: страницы, варианты, требования…')} onChange={event=>setDetails(event.target.value)}/></>:<button type="button" className="text-xs font-medium text-primary hover:underline" onClick={()=>setShowDetails(true)}>+ {t('Подробности')}</button>}
   <div role="group" aria-label={t('Срок')} className="flex flex-wrap items-center gap-1.5">{chip('this',t('К этой паре'))}{chip('next',due==='next'&&nextDate?`${t('К следующей паре')} · ${formatDueDate(nextDate,{day:'numeric',month:'short'})}`:t('К следующей паре'))}{chip('custom',t('Другая дата'))}{due==='custom'&&<input type="date" aria-label={t('Дата сдачи')} className={cn(inputClass,'h-8 w-auto')} value={customDate} onChange={event=>setCustomDate(event.target.value)}/>}{due==='next'&&!nextDate&&<Loader2 className="size-4 animate-spin text-muted-foreground" aria-label={t('Ищем следующее занятие')}/>}</div>
   <FilePicker disabled={saving} onFiles={files=>setPending(list=>[...list,...files])} label={t('Фото, PDF или документ к заданию')}/>
   {pending.length>0&&<ul className="flex flex-wrap gap-1.5">{pending.map((file,index)=><li key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-card py-0.5 pl-2.5 pr-1 text-xs"><span className="max-w-[180px] truncate">{file.name}</span><span className={cn('text-muted-foreground',file.size>MAX_ATTACHMENT_BYTES&&'text-destructive')}>{fileSize(file.size)}</span><button type="button" className="rounded-full p-0.5 hover:bg-muted" aria-label={`${t('Убрать')} ${file.name}`} onClick={()=>setPending(list=>list.filter((_,i)=>i!==index))}><X className="size-3.5"/></button></li>)}</ul>}
   <UploadStatus items={uploads.items} onDismiss={uploads.dismiss}/>
  </form>}
 </section>
}

function HomeworkEditor({item,onCancel,onSaved}:{item:HomeworkItem;onCancel:()=>void;onSaved:()=>Promise<void>}){
 useLanguage()
 const [title,setTitle]=useState(item.title),[details,setDetails]=useState(item.description??''),[date,setDate]=useState(item.dueAt?.slice(0,10)??''),[busy,setBusy]=useState(false),[error,setError]=useState(''),uploads=useUploads(),id=useId()
 return <li className="rounded-lg border border-primary/40 bg-card p-3"><form className="space-y-2" onSubmit={event=>{event.preventDefault();if(!title.trim())return;setBusy(true);setError('');void campusApi.patchHomework(item.id,{title:title.trim(),description:details.trim()||null,dueAt:date?dueAtForDate(date):null}).then(onSaved).catch(e=>setError(errorText(e))).finally(()=>setBusy(false))}}>
  <label className="block text-xs font-medium text-muted-foreground" htmlFor={`${id}-t`}>{t('Задание')}</label><input id={`${id}-t`} className={inputClass} value={title} maxLength={300} required onChange={event=>setTitle(event.target.value)}/>
  <label className="block text-xs font-medium text-muted-foreground" htmlFor={`${id}-d`}>{t('Подробности')}</label><textarea id={`${id}-d`} className={areaClass} value={details} maxLength={10000} onChange={event=>setDetails(event.target.value)}/>
  <label className="block text-xs font-medium text-muted-foreground" htmlFor={`${id}-due`}>{t('Срок')}</label><input id={`${id}-due`} type="date" className={inputClass} value={date} onChange={event=>setDate(event.target.value)}/>
  <FilePicker disabled={busy} onFiles={files=>void uploads.run('homework',item.id,files)} label={t('Добавить файлы к заданию')}/>
  <UploadStatus items={uploads.items} onDismiss={uploads.dismiss}/>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  <div className="flex gap-2"><Button type="submit" size="sm" disabled={busy||uploads.busy||!title.trim()}>{busy?t('Сохранение…'):t('Сохранить')}</Button><Button type="button" size="sm" variant="outline" disabled={busy||uploads.busy} onClick={onCancel}>{t('Отмена')}</Button></div>
 </form></li>
}

const materialIcon={link:Link2,document:FileText,image:ImageIcon,book:BookMarked,note:FileText} as const
type NoteState='idle'|'dirty'|'saving'|'saved'|'error'
/** Заметка к занятию (автосохранение с паузой) и файлы/ссылки к конкретной дате. */
export function LessonNotesFiles({lesson,note,readOnly,filesEnabled,onSaveNote,onChanged}:{lesson:LessonRef;note:string;readOnly:boolean;filesEnabled:boolean;onSaveNote:(note:string)=>unknown;onChanged?:(count:number)=>void}){
 useLanguage()
 const [draft,setDraft]=useState(note),[state,setState]=useState<NoteState>('idle')
 const timer=useRef<number|undefined>(undefined),pending=useRef<string|null>(null),chain=useRef<Promise<void>>(Promise.resolve()),save=useRef(onSaveNote);save.current=onSaveNote
 const flush=useCallback(()=>{window.clearTimeout(timer.current);const value=pending.current;if(value===null)return;pending.current=null;setState('saving');chain.current=chain.current.then(async()=>{let result:unknown;try{result=await save.current(value)}catch{result=false}if(pending.current===null)setState(result===false?'error':'saved')})},[])
 useEffect(()=>()=>flush(),[flush])
 const [materials,setMaterials]=useState<MaterialItem[]>([]),[loading,setLoading]=useState(filesEnabled),[error,setError]=useState(''),[link,setLink]=useState(''),[linkTitle,setLinkTitle]=useState(''),[linkOpen,setLinkOpen]=useState(false),uploads=useUploads(),changed=useRef(onChanged);changed.current=onChanged
 const load=useCallback(async()=>{if(!filesEnabled)return;const rows=await campusApi.lessonMaterials(lesson.slotId,lesson.date);setMaterials(rows);changed.current?.(rows.length)},[filesEnabled,lesson.slotId,lesson.date])
 useEffect(()=>{let active=true;setError('');load().catch(e=>{if(active)setError(errorText(e))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[load])
 const base={subjectId:lesson.subjectId??null,scheduleSlotId:lesson.slotId,lessonDate:lesson.date}
 async function addFiles(files:File[]){setError('');const created:string[]=[];await uploads.run('material',async file=>{const row=await campusApi.createMaterial({...base,title:file.name.slice(0,300),kind:file.type.startsWith('image/')||/\.(heic|heif)$/i.test(file.name)?'image':'document'});created.push(String(row.id));return String(row.id)},files);
  // Материал без файла не нужен: убираем пустые записи, если загрузка не удалась.
  const rows=await campusApi.lessonMaterials(lesson.slotId,lesson.date).catch(()=>null);if(rows){for(const id of created)if(!rows.find(row=>row.id===id)?.attachments.length)await campusApi.deleteMaterial(id).catch(()=>{})}await load().catch(e=>setError(errorText(e)))}
 async function addLink(){let url=link.trim();if(!url)return;if(!/^https?:\/\//i.test(url))url=`https://${url}`;setError('');try{await campusApi.createMaterial({...base,title:(linkTitle.trim()||url.replace(/^https?:\/\//i,'')).slice(0,300),kind:'link',url});setLink('');setLinkTitle('');setLinkOpen(false);await load()}catch(e){setError(errorText(e))}}
 const act=async(work:Promise<unknown>)=>{setError('');try{await work;await load()}catch(e){setError(errorText(e))}}
 const stateLabel=state==='saving'||state==='dirty'?t('Сохраняю…'):state==='saved'?t('Сохранено'):state==='error'?t('Не удалось сохранить'):t('Только для этой даты')
 return <section className="border-b border-border px-5 py-5" aria-labelledby="lesson-notes-title">
  <h3 id="lesson-notes-title" className="text-sm font-semibold text-foreground">{t('Заметки и файлы к уроку')}</h3>
  <div className="mb-1.5 mt-3 flex items-center justify-between gap-2"><label htmlFor="lesson-note" className="text-xs font-medium text-muted-foreground">{t('Заметка')}</label><span aria-live="polite" className={cn('inline-flex items-center gap-1 text-[10px]',state==='error'?'text-destructive':state==='saved'?'text-emerald-700 dark:text-emerald-400':'text-muted-foreground')}>{(state==='saving'||state==='dirty')&&<Loader2 className="size-3 animate-spin"/>}{state==='saved'&&<Check className="size-3"/>}{stateLabel}</span></div>
  <textarea disabled={readOnly} id="lesson-note" className={cn(areaClass,'min-h-[96px]')} value={draft} maxLength={5000} placeholder={t('Заметка о занятии в выбранном расписании…')} onChange={event=>{setDraft(event.target.value);pending.current=event.target.value;setState('dirty');window.clearTimeout(timer.current);timer.current=window.setTimeout(flush,600)}} onBlur={flush}/>
  {filesEnabled&&<div className="mt-4">
   <p className="text-xs font-medium text-muted-foreground">{t('Файлы и ссылки')}</p>
   {loading?<p role="status" className="mt-2 text-sm text-muted-foreground">{t('Загрузка…')}</p>:materials.length?<ul className="mt-2 space-y-2">{materials.map(material=>{const Icon=materialIcon[material.kind]??FileText,files=material.attachments??[];return <li key={material.id} className="rounded-lg border border-border bg-card p-2.5">
    <div className="flex items-start gap-2.5"><span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><Icon className="size-4"/></span>
     <div className="min-w-0 flex-1">{material.url&&/^https?:\/\//i.test(material.url)?<a href={material.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1 text-xs font-medium text-primary hover:underline"><span className="truncate">{material.title}</span><ExternalLink className="size-3 shrink-0"/><span className="sr-only">{t('в новой вкладке')}</span></a>:<p className="truncate text-xs font-medium text-foreground">{material.title}</p>}
      {material.description&&<p className="mt-0.5 line-clamp-3 whitespace-pre-wrap break-words text-[11px] text-muted-foreground">{material.description}</p>}
      {!material.lessonDate&&<p className="mt-0.5 text-[10px] text-muted-foreground">{t('ко всем занятиям предмета')}</p>}</div>
     {!readOnly&&<ConfirmDelete compact label={`${t('Удалить')} ${material.title}`} onConfirm={()=>act(campusApi.deleteMaterial(material.id))}/>}</div>
    {files.length>1||(files.length===1&&(files[0].fileName!==material.title||isImage(files[0])))?<AttachmentList files={files} onDelete={readOnly?undefined:file=>act(campusApi.deleteAttachment(file.id))}/>:files.length===1&&<a href={campusApi.attachmentUrl(files[0].id)} target="_blank" rel="noreferrer" className="ml-[42px] mt-1 inline-block text-[11px] text-primary hover:underline">{fileSize(files[0].byteSize)} · {t('открыть')}</a>}
   </li>})}</ul>:<p className="mt-1.5 text-xs text-muted-foreground">{t('Файлов к этому занятию пока нет.')}</p>}
   {error&&<p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
   {!readOnly&&<div className="mt-3 space-y-2">
    <FilePicker disabled={uploads.busy} onFiles={files=>void addFiles(files)} label={t('Конспект, фото доски, презентация…')}/>
    <UploadStatus items={uploads.items} onDismiss={uploads.dismiss}/>
    {linkOpen?<form className="space-y-2 rounded-md border border-border p-2.5" onSubmit={event=>{event.preventDefault();void addLink()}}><label htmlFor="lesson-link" className="sr-only">{t('Ссылка')}</label><input id="lesson-link" type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} className={inputClass} placeholder="https://" value={link} onChange={event=>setLink(event.target.value)}/><label htmlFor="lesson-link-title" className="sr-only">{t('Название ссылки')}</label><input id="lesson-link-title" className={inputClass} placeholder={t('Название (необязательно)')} maxLength={300} value={linkTitle} onChange={event=>setLinkTitle(event.target.value)}/><div className="flex gap-2"><Button type="submit" size="sm" disabled={!link.trim()}>{t('Добавить ссылку')}</Button><Button type="button" size="sm" variant="outline" onClick={()=>setLinkOpen(false)}>{t('Отмена')}</Button></div></form>:<button type="button" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline" onClick={()=>setLinkOpen(true)}><Link2 className="size-3.5"/>{t('Добавить ссылку')}</button>}
   </div>}
  </div>}
 </section>
}
