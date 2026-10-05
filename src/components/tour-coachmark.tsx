import {useLayoutEffect,useRef,useState,type ReactNode} from 'react'
import {createPortal} from 'react-dom'
type Rect={left:number;top:number;width:number;height:number;bottom:number;right:number}
export function TourCoachmark({target,step,children}:{target:string;step:number;children:ReactNode}){
 const panel=useRef<HTMLDivElement>(null),[layout,setLayout]=useState<{rect:Rect;left:number;top:number;width:number;height:number;below:boolean}|null>(null)
 useLayoutEffect(()=>{
 setLayout(null)
 let frame=0;const element=document.querySelector<HTMLElement>(target)
 element?.scrollIntoView({block:innerWidth<640?'start':'center',behavior:'instant'})
 const update=()=>{const el=document.querySelector<HTMLElement>(target);if(!el||!panel.current){setLayout(null);return}const r=el.getBoundingClientRect(),width=Math.min(360,innerWidth-24),height=panel.current.getBoundingClientRect().height;const below=r.top<height+24;setLayout({rect:{left:r.left,top:r.top,width:r.width,height:r.height,bottom:r.bottom,right:r.right},width,height,below,left:Math.max(12,Math.min(innerWidth-width-12,r.left+r.width/2-width/2)),top:innerWidth<640?innerHeight-height-16:Math.max(12,Math.min(innerHeight-height-80,below?r.bottom+22:r.top-height-22))})}
 const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update)}
 const observer=new ResizeObserver(schedule);if(panel.current)observer.observe(panel.current);if(element)observer.observe(element)
 const mutations=new MutationObserver(schedule);mutations.observe(document.body,{childList:true,subtree:true});
 const positionTimer=setInterval(schedule,100)
 update();window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true)
 return()=>{clearInterval(positionTimer);mutations.disconnect();observer.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true)}
 },[target,step])
 return createPortal(<>{layout&&<><div data-tour-spotlight={target} aria-hidden="true" className="pointer-events-none fixed z-[60] rounded-lg border-[3px] border-blue-400" style={{left:layout.rect.left-5,top:layout.rect.top-5,width:layout.rect.width+10,height:layout.rect.height+10,boxShadow:'0 0 0 9999px rgb(2 6 23 / 0.62), 0 0 24px rgb(59 130 246 / 0.8)'}}/><svg aria-hidden="true" className="pointer-events-none fixed inset-0 z-[65] h-full w-full"><defs><marker id="tour-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="none" stroke="#60a5fa" strokeWidth="2"/></marker></defs><path d={`M ${layout.left+layout.width/2} ${layout.below?layout.top:layout.top+layout.height} L ${layout.rect.left+layout.rect.width/2} ${layout.below?layout.rect.bottom+7:layout.rect.top-7}`} stroke="#60a5fa" strokeWidth="3" markerEnd="url(#tour-arrow)"/></svg></>}
 <div ref={panel} role="region" aria-label="Подсказка обучения" className="fixed z-[70] max-h-[42dvh] sm:max-h-[55dvh] overflow-y-auto rounded-2xl border-2 border-blue-400 bg-card p-4 shadow-2xl" style={{width:layout?.width??'min(360px, calc(100vw - 24px))',left:layout?.left??12,top:layout?.top??12}}>{children}</div></>,document.body)
}
