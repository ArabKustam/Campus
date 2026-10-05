import {useEffect,useState} from 'react'
import {HardDrive} from 'lucide-react'
import {requestApi} from '../lib/api-client'
type Storage={items:{kind:string;bytes:number;count:number;oldest:number}[];accounts:number;registryBytes?:number|null;freePlanLimitBytes:number;workspaceLimitBytes:number}
const size=(bytes:number)=>bytes>=1024**3?`${(bytes/1024**3).toFixed(2)} ГБ`:`${(bytes/1024**2).toFixed(1)} МБ`
export function AdminStorage(){const [data,setData]=useState<Storage|null>(null),[error,setError]=useState('');useEffect(()=>{void requestApi<Storage>('/api/admin/storage').then(setData).catch(e=>setError(e.message))},[])
 if(error)return <p role="alert" className="text-sm text-destructive">{error}</p>
 if(!data)return <p role="status">Считаем объём хранилища…</p>
 const used=data.items.reduce((sum,row)=>sum+row.bytes,0),coverage=data.items.find(row=>row.kind==='account')?.count??0
 return <section className="space-y-4 rounded-xl border p-5"><h2 className="flex items-center gap-2 font-semibold"><HardDrive className="size-5"/>Хранилище</h2><div className="grid gap-4 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Занято в измеренных хранилищах</p><strong className="text-2xl">{size(used)}</strong></div><div><p className="text-xs text-muted-foreground">Остаток от лимита Free · оценка</p><strong className="text-2xl">{size(Math.max(0,data.freePlanLimitBytes-used))}</strong></div><div><p className="text-xs text-muted-foreground">Общий архив УМКД</p><strong className="text-2xl">{size(data.items.find(row=>row.kind==='archive')?.bytes??0)}</strong></div></div><progress aria-label="Заполнение хранилища" value={used} max={data.freePlanLimitBytes} className="h-2 w-full accent-blue-600"/><p className="text-sm">Служебная база D1: {data.registryBytes==null?'нет замера':size(data.registryBytes)}</p><p className="text-xs text-muted-foreground">Измерено аккаунтов: {coverage} из {data.accounts}. Лимит Free: 5 ГБ суммарно, 1 ГБ на отдельное хранилище. Обновите сведения всех аккаунтов для полного замера. Другие проекты Cloudflare и служебная база D1 сюда не входят.</p></section>
}
