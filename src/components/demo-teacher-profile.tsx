import {useRef} from 'react'
import {createPortal} from 'react-dom'
import {X} from 'lucide-react'
import {Button} from './ui/button'
import {t} from '../lib/language'
import {useDialogFocus} from '../hooks/use-dialog-focus'
export function DemoTeacherProfile({onClose}:{onClose:()=>void}){
 const panel=useRef<HTMLDivElement>(null);useDialogFocus(panel,true,onClose)
 return createPortal(<div className="fixed inset-0 z-[100] flex justify-end bg-black/50"><div ref={panel} role="dialog" aria-modal="true" aria-label={t('Учебная карточка преподавателя')} className="h-dvh w-full max-w-lg space-y-5 overflow-y-auto bg-background p-5"><header className="flex items-center justify-between"><strong>{t('Учебная карточка преподавателя')}</strong><Button size="icon" variant="ghost" onClick={onClose} aria-label={t('Закрыть карточку преподавателя')}><X/></Button></header><img src="/demo-teacher.svg" alt={t('Вымышленный преподаватель')} className="h-48 w-44 rounded-xl object-cover"/><h2 className="text-xl font-semibold">{t('Александр Сергеевич Примеров')}</h2><p className="text-sm text-primary">{t('Вымышленный профиль для обучения')}</p><p>{t('Преподаватель физики. Объясняет сложные темы на понятных примерах, ведёт лекции и лабораторные работы.')}</p><dl className="space-y-3 text-sm"><div><dt className="text-muted-foreground">{t('Кафедра')}</dt><dd>{t('Прикладная физика · учебный пример')}</dd></div><div><dt className="text-muted-foreground">{t('Консультации')}</dt><dd>{t('Среда, 15:00–16:00 · кабинет 101')}</dd></div></dl><p className="text-sm text-muted-foreground">{t('В настоящем расписании здесь будут фото и сведения преподавателя с сайта университета. Этот пример работает без поиска и интернета.')}</p><Button onClick={onClose}>{t('Понятно, продолжить обучение')}</Button></div></div>,document.body)
}
