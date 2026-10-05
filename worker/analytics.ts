import type {Bindings} from './types'
export function clientDevice(ua:string){return {device:/iPad|Tablet/i.test(ua)?'tablet':/Android|iPhone|Mobile/i.test(ua)?'phone':'desktop',browser:/Edg/i.test(ua)?'Edge':/Firefox|FxiOS/i.test(ua)?'Firefox':/Chrome|CriOS/i.test(ua)?'Chrome':/Safari/i.test(ua)?'Safari':'Другой'}}
export async function recordEvent(env:Bindings,id:string,kind:string,page:string,ua:string,detail:string|null=null,eventId:string=crypto.randomUUID()){
 const db=env.REGISTRY??env.DB,{device,browser}=clientDevice(ua)
 await db.prepare('INSERT OR IGNORE INTO account_events(id,account_id,kind,page,device,browser,detail,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(eventId,id,kind,page,device,browser,detail?.slice(0,200)??null,Date.now()).run()
}
