import {useState} from 'react'
import {requestApi} from '../lib/api-client'
import {Modal} from './ui/modal'
import {Button} from './ui/button'
const features=[['ai','AI-помощник','Чат и изменение расписания через AI'],['groups','Группы','Общее расписание, участники и подгруппы'],['messengers','Мессенджеры','Telegram, WhatsApp, люди и автоматизация'],['tasks','Задания и материалы','Учебные задания и прикреплённые материалы']]
export function AdminAccess({user,onClose,onSaved}:{user:{id:string;login:string;features?:string[]};onClose:()=>void;onSaved:()=>void}){
 const [selected,setSelected]=useState(user.features??[]),[busy,setBusy]=useState(false),[error,setError]=useState('')
 async function save(){setBusy(true);setError('');try{await requestApi(`/api/admin/accounts/${user.id}/permissions`,{method:'PUT',body:JSON.stringify({features:selected})});onSaved();onClose()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <Modal title={`Права · @${user.login}`} onClose={onClose}><div className="space-y-4">{features.map(([id,title,description])=><label key={id} className="flex cursor-pointer items-start gap-3 rounded-xl border p-3"><input className="mt-1 size-4" type="checkbox" checked={selected.includes(id)} onChange={e=>setSelected(v=>e.target.checked?[...v,id]:v.filter(f=>f!==id))}/><span className="text-sm font-medium">{title}<span className="mt-1 block text-xs font-normal text-muted-foreground">{description}</span></span></label>)}<p className="text-xs text-muted-foreground">Раздел появится после обновления страницы. Права администратора не выдаются.</p>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={busy} onClick={()=>void save()}>{busy?'Сохраняем…':'Сохранить права'}</Button></div></Modal>
}
