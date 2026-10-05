import {useCallback,useEffect,useRef,useState} from 'react'
import {getDocument,GlobalWorkerOptions,type PDFDocumentProxy,type RenderTask} from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {ChevronLeft,ChevronRight,ZoomIn,ZoomOut} from 'lucide-react'
import {t,useLanguage} from '../lib/language'
import {Button} from './ui/button'

GlobalWorkerOptions.workerSrc=workerUrl

function PdfPage({document,index,width,zoom,title,onVisible}:{document:PDFDocumentProxy;index:number;width:number;zoom:number;title:string;onVisible:(page:number)=>void}){
 const frame=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null)
 const [near,setNear]=useState(index===1),[rendered,setRendered]=useState(false),[ratio,setRatio]=useState(1.414)
 useEffect(()=>{const element=frame.current;if(!element)return;const observer=new IntersectionObserver(entries=>{const entry=entries[0];if(entry.isIntersecting){setNear(true);if(entry.intersectionRatio>=.35)onVisible(index)}},{rootMargin:'900px 0px',threshold:[0,.35,.65]});observer.observe(element);return()=>observer.disconnect()},[index,onVisible])
 useEffect(()=>{if(!near||!canvas.current)return;let active=true,render:RenderTask|undefined;setRendered(false)
  void document.getPage(index).then(async page=>{if(!active||!canvas.current)return;const normal=page.getViewport({scale:1});setRatio(normal.height/normal.width);const viewport=page.getViewport({scale:Math.max(.2,(width-2)/normal.width)*zoom}),pixelRatio=Math.min(window.devicePixelRatio||1,2),element=canvas.current;element.width=Math.floor(viewport.width*pixelRatio);element.height=Math.floor(viewport.height*pixelRatio);element.style.width=`${viewport.width}px`;element.style.height=`${viewport.height}px`;render=page.render({canvas:element,viewport,transform:pixelRatio===1?undefined:[pixelRatio,0,0,pixelRatio,0,0]});await render.promise;if(active)setRendered(true)}).catch(error=>{if(active&&error?.name!=='RenderingCancelledException')setRendered(true)})
  return()=>{active=false;render?.cancel()}
 },[document,index,near,width,zoom])
 const pageWidth=Math.max(160,width-2)*zoom
 return <section ref={frame} data-pdf-page={index} aria-label={`${t('Страница документа')} ${index}`} className="scroll-mt-16 overflow-x-auto rounded-lg border bg-white shadow-sm" style={{minHeight:Math.round(pageWidth*ratio)}}>
  {!rendered&&<div role="status" className="grid min-h-56 place-items-center text-sm text-slate-500">{t('Открываем документ…')}</div>}
  <canvas ref={canvas} aria-label={`${title} · ${index}`} role="img" className={rendered?'mx-auto block':'hidden'}/>
 </section>
}

export function PdfPreview({url,title}:{url:string;title:string}){
 useLanguage()
 const [document,setDocument]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[pageInput,setPageInput]=useState('1'),[zoom,setZoom]=useState(1),[width,setWidth]=useState(600),[busy,setBusy]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0)
 const box=useRef<HTMLDivElement>(null)
 useEffect(()=>{if(!box.current)return;const observer=new ResizeObserver(entries=>setWidth(Math.max(160,Math.floor(entries[0].contentRect.width))));observer.observe(box.current);return()=>observer.disconnect()},[])
 useEffect(()=>{let active=true;setDocument(null);setPage(1);setPageInput('1');setZoom(1);setBusy(true);setError('');const task=getDocument({url,withCredentials:true,useSystemFonts:true});void task.promise.then(pdf=>{if(active){setDocument(pdf);setBusy(false)}}).catch(()=>{if(active){setError(t('Не удалось показать PDF. Повторите попытку или скачайте документ.'));setBusy(false)}});return()=>{active=false;void task.destroy()}},[url,retry])
 const goTo=useCallback((value:number)=>{if(!document)return;const next=Math.min(document.numPages,Math.max(1,Math.round(value)));setPage(next);setPageInput(String(next));globalThis.document.querySelector<HTMLElement>(`[data-pdf-page="${next}"]`)?.scrollIntoView({behavior:'smooth',block:'start'})},[document])
 const visible=useCallback((value:number)=>{setPage(value);setPageInput(String(value))},[])
 return <div ref={box} className="min-w-0 space-y-3">
  {document&&<div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background/95 p-2 shadow-sm backdrop-blur">
   <div className="flex items-center gap-1"><Button size="icon" variant="ghost" disabled={page===1} aria-label={t('Предыдущая страница')} onClick={()=>goTo(page-1)}><ChevronLeft/></Button><label className="flex items-center gap-1 text-xs"><span className="sr-only">{t('Номер страницы')}</span><input aria-label={t('Номер страницы')} inputMode="numeric" type="number" min="1" max={document.numPages} value={pageInput} onChange={event=>setPageInput(event.target.value)} onBlur={()=>goTo(Number(pageInput)||page)} onKeyDown={event=>{if(event.key==='Enter')goTo(Number(pageInput)||page)}} className="h-8 w-14 rounded-md border bg-background px-2 text-center tabular-nums"/><span className="tabular-nums text-muted-foreground">/ {document.numPages}</span></label><Button size="icon" variant="ghost" disabled={page===document.numPages} aria-label={t('Следующая страница')} onClick={()=>goTo(page+1)}><ChevronRight/></Button></div>
   <div className="flex items-center gap-1"><Button size="icon" variant="ghost" disabled={zoom<=.75} aria-label={t('Уменьшить')} onClick={()=>setZoom(n=>Math.max(.75,n-.25))}><ZoomOut/></Button><span className="text-xs tabular-nums">{Math.round(zoom*100)}%</span><Button size="icon" variant="ghost" disabled={zoom>=2} aria-label={t('Увеличить')} onClick={()=>setZoom(n=>Math.min(2,n+.25))}><ZoomIn/></Button></div>
  </div>}
  {busy&&<p role="status" className="text-sm text-muted-foreground">{t('Открываем документ…')}</p>}
  {error&&<div role="alert" className="space-y-2 rounded-lg border p-4"><p className="text-sm">{error}</p><Button variant="outline" onClick={()=>setRetry(n=>n+1)}>{t('Повторить')}</Button></div>}
  {document&&<div className="space-y-4" aria-label={t('Страницы документа')}>{Array.from({length:document.numPages},(_,index)=><PdfPage key={index+1} document={document} index={index+1} width={width} zoom={zoom} title={title} onVisible={visible}/>)}</div>}
 </div>
}
