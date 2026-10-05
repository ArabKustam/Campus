import {useRef, type ReactNode} from 'react'
import {createPortal} from 'react-dom'
import {X} from 'lucide-react'
import {useDialogFocus} from '../../hooks/use-dialog-focus'
import {t} from '../../lib/language'
import {Button} from './button'

export function Modal({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean}) {
 const ref=useRef<HTMLDivElement>(null)
 useDialogFocus(ref,true,onClose)
 return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 sm:p-6">
  <button data-dialog-backdrop tabIndex={-1} aria-label={t('Закрыть')} className="absolute inset-0" onClick={onClose}/>
  <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`relative flex h-dvh w-full flex-col overflow-hidden bg-background shadow-xl sm:h-auto sm:max-h-[90dvh] sm:rounded-xl ${wide?'sm:max-w-5xl':'sm:max-w-xl'}`}>
   <header className="flex shrink-0 items-center gap-3 border-b p-4"><h2 className="min-w-0 flex-1 break-words font-semibold">{title}</h2><Button variant="ghost" size="icon" aria-label={t('Закрыть')} onClick={onClose}><X/></Button></header>
   <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
  </div>
 </div>,document.getElementById('root')??document.body)
}
