import {t,useLanguage} from '../lib/language'
import {useEffect,useRef,useState} from 'react'
import {Download,Share,MoreVertical,SquarePlus,Smartphone} from 'lucide-react'
import {requestApi} from '../lib/api-client'
import {Modal} from './ui/modal'
import {Button} from './ui/button'
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>}
export function AccountActivity({paused=false,page='schedule'}:{paused?:boolean;page?:string}){
 useLanguage()
 const [open,setOpen]=useState(false),[details,setDetails]=useState(false),[install,setInstall]=useState<InstallEvent|null>(null),[error,setError]=useState('')
 const pausedRef=useRef(paused);pausedRef.current=paused
 const ios=/iPhone|iPad|iPod/.test(navigator.userAgent),mobile=/Android|iPhone|iPad|iPod/.test(navigator.userAgent)
 useEffect(()=>{
  let active=true,busy=false,last=performance.now(),visible=document.visibilityState==='visible'
  const installed=()=>window.matchMedia('(display-mode: standalone)').matches||Boolean((navigator as Navigator&{standalone?:boolean}).standalone)
  async function tick(){
   const now=performance.now(),elapsed=visible?Math.min(60000,Math.max(0,now-last)):0;last=now
   const isVisible=document.visibilityState==='visible',wasVisible=visible;visible=isVisible
   if(busy||(!wasVisible&&!isVisible))return
   busy=true
   try{const result=await requestApi<{showInstall:boolean;installRequest:number}>('/api/activity',{method:'POST',keepalive:!isVisible,body:JSON.stringify({elapsed,mobile,installed:installed(),page})})
    if(active&&document.visibilityState==='visible'&&result.showInstall&&!pausedRef.current&&!document.querySelector('[role="dialog"]')){const claim=await requestApi<{claimed:boolean}>('/api/activity/install-shown',{method:'POST',body:JSON.stringify({request:result.installRequest})});if(active&&claim.claimed)setOpen(true)}
   }catch{/* Activity must never interrupt studying or sign-in. */}finally{busy=false}
  }
  const onInstall=(event:Event)=>{event.preventDefault();setInstall(event as InstallEvent)}
  const onInstalled=()=>{setOpen(false);setInstall(null);void tick()}
  window.addEventListener('beforeinstallprompt',onInstall);window.addEventListener('appinstalled',onInstalled)
  document.addEventListener('visibilitychange',tick);window.addEventListener('pagehide',tick)
  const timer=setInterval(()=>void tick(),60000);void tick()
  return()=>{active=false;void tick();clearInterval(timer);document.removeEventListener('visibilitychange',tick);window.removeEventListener('pagehide',tick);window.removeEventListener('beforeinstallprompt',onInstall);window.removeEventListener('appinstalled',onInstalled)}
 },[mobile,page])
 useEffect(()=>{const show=()=>{setOpen(true);setDetails(true)};window.addEventListener('campus-install-guide',show);return()=>window.removeEventListener('campus-install-guide',show)},[])
 if(!open)return null
 if(!details)return <aside aria-label="Установить Campus" className="fixed bottom-20 left-3 right-3 z-40 rounded-xl border bg-card p-3 shadow-lg sm:left-auto sm:w-80"><div className="flex gap-3"><img src="/campus-192.png" alt="" className="size-10 rounded-lg"/><div className="min-w-0 flex-1"><strong className="text-sm">Расписание — одним нажатием</strong><p className="mt-1 text-xs text-muted-foreground">Добавьте Campus на главный экран телефона.</p></div><button aria-label="Скрыть предложение установки" className="self-start p-1 text-muted-foreground" onClick={()=>setOpen(false)}>×</button></div><Button size="sm" className="mt-3 w-full" onClick={()=>setDetails(true)}>Показать, как установить</Button></aside>
 return <Modal title={t("Campus на главном экране")} onClose={()=>{setOpen(false);setDetails(false)}}><div className="space-y-5"><div className="flex items-center gap-3"><img src="/campus-192.png" width="56" height="56" alt="" className="rounded-xl"/><div><h3 className="font-semibold">{t("Открывайте расписание одним нажатием")}</h3><p className="text-sm text-muted-foreground">{t("Добавьте Campus как приложение. Ваш аккаунт и данные останутся теми же.")}</p></div></div>
 <ol className="space-y-4 text-sm">{(ios?[[Share,'Откройте этот сайт в Safari и нажмите «Поделиться» (квадрат со стрелкой вверх).'],[SquarePlus,'Выберите «На экран “Домой”». Если пункт не виден, прокрутите список действий.'],[Smartphone,'Включите «Открывать как веб-приложение», если этот переключатель есть, и нажмите «Добавить».']]:[[MoreVertical,'В Chrome нажмите три точки ⋮ в правом верхнем углу.'],[SquarePlus,'Выберите «Добавить на главный экран» или «Установить приложение». Название зависит от версии браузера.'],[Smartphone,'Подтвердите установку. Значок Campus появится среди приложений или на главном экране.']]).map(([Icon,text],i)=>{const StepIcon=Icon as typeof Share;return <li key={i} className="flex gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted"><StepIcon className="size-4"/></span><span><strong>{i+1}. </strong>{t(String(text))}</span></li>})}</ol>
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 {install&&<Button className="w-full" onClick={()=>void (async()=>{try{await install.prompt();await install.userChoice;setInstall(null)}catch{setError('Используйте меню браузера по инструкции выше.')}})()}><Download className="mr-2 size-4"/>{t("Установить Campus")}</Button>}
 <Button variant="outline" className="w-full" onClick={()=>setOpen(false)}>Понятно</Button><p className="text-xs text-muted-foreground">{t("Автоматически эта подсказка больше не появится. Для работы сайта по-прежнему нужен интернет.")}</p></div></Modal>
}
