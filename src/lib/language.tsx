import {Languages,Check,ChevronDown} from 'lucide-react'
import {dictionary} from './translations'
import {createContext,useContext,useState,useEffect,useRef,useId,type ReactNode} from 'react'
export type Language='ru'|'en'|'kk'
const Context=createContext<{language:Language;setLanguage:(language:Language)=>void}>({language:'ru',setLanguage:()=>{}})
let active:Language='ru'
export function t(text:string){return active==='ru'?text:dictionary[text]?.[active==='en'?0:1]??text}
export function useLanguage(){return useContext(Context).language}
const languages=[{id:'ru',code:'RU',name:'Русский',flag:'🇷🇺'},{id:'en',code:'EN',name:'English',flag:'🇬🇧'},{id:'kk',code:'KZ',name:'Қазақша',flag:'🇰🇿'}] as const
export function LanguageSelect({sidebar=false}:{sidebar?:boolean}){
 const {language,setLanguage}=useContext(Context),[open,setOpen]=useState(false),ref=useRef<HTMLDivElement>(null),id=useId()
 const current=languages.find(item=>item.id===language)!
 useEffect(()=>{if(!open)return;const close=(event:PointerEvent)=>{if(!ref.current?.contains(event.target as Node))setOpen(false)};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[open])
 return <div ref={ref} className={sidebar?'relative':'relative inline-block'} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();setOpen(false);ref.current?.querySelector('button')?.focus()}}}>
 <button type="button" aria-label={`Language / Язык / Тіл: ${current.name}`} title="Language / Язык / Тіл" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)} className={sidebar?'flex min-h-11 w-full items-center gap-3 rounded-md px-2.5 text-left text-[13px] font-medium text-muted-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary':'flex min-h-10 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary'}><Languages className="size-[17px] shrink-0 stroke-[1.75]"/><span className={sidebar?'sidebar-label flex-1':''}>{current.name}</span><span className={sidebar?'sidebar-label text-[10px] text-muted-foreground':'text-[10px]'}>{current.code}</span>{!sidebar&&<ChevronDown className="size-3"/>}</button>
 {open&&<div id={id} aria-label="Language / Язык / Тіл" className={sidebar?'sidebar-label space-y-1 rounded-md bg-muted/50 p-1':'absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border bg-card p-1 shadow-md'}>{languages.map(item=><button type="button" key={item.id} lang={item.id} aria-pressed={item.id===language} onClick={()=>{setLanguage(item.id);setOpen(false);ref.current?.querySelector('button')?.focus()}} className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><span aria-hidden="true">{item.flag}</span><span className="flex-1">{item.name}</span><span className="text-[10px] text-muted-foreground">{item.code}</span>{item.id===language&&<Check className="size-3"/>}</button>)}</div>}
 </div>
}
export function locale(){return active==='kk'?'kk-KZ':active==='en'?'en-GB':'ru-RU'}
export function LanguageProvider({children}:{children:ReactNode}){
 const [language,update]=useState<Language>(()=>{const saved=localStorage.getItem('campus-language');return saved==='en'||saved==='kk'?saved:'ru'})
 active=language
 useEffect(()=>{document.documentElement.lang=language;localStorage.setItem('campus-language',language)},[language])
 return <Context.Provider value={{language,setLanguage:update}}>{children}</Context.Provider>
}
