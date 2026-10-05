import {Hono} from 'hono'
import {z} from 'zod'
import type {Bindings} from '../types'
import {ok,apiError,validationError} from '../lib/api'
import {journalOptions,loadJournal} from '../services/platonus-journal'
import {PlatonusError} from '../services/platonus-api'
import {connection} from '../services/platonus-cloud'
export const journalRoutes=new Hono<{Bindings:Bindings}>()
const period=z.object({year:z.coerce.number().int().min(2000).max(2200),term:z.coerce.number().int().min(0).max(20)})
journalRoutes.use('/platonus/grades*',async(c,next)=>{if((c.req.method==='POST'||c.req.query('refresh')==='1')&&!(await connection(c.env.DB)).credentials_cipher)return apiError(c,409,'PLATONUS_LOGIN_REQUIRED','Для обновления войдите в Platonus ещё раз. Данные входа не сохранены.');await next()})
journalRoutes.get('/platonus/grades/options',async c=>{try{return ok(c,await journalOptions(c.env,c.req.query('refresh')==='1'))}catch(e){return apiError(c,502,'PLATONUS_JOURNAL',e instanceof PlatonusError?e.message:'Не удалось загрузить периоды Platonus. Попробуйте позже.')}})
for(const method of ['get','post'] as const)journalRoutes[method]('/platonus/grades',async c=>{
 const p=period.safeParse(c.req.query());if(!p.success)return validationError(c,p.error)
 try{return ok(c,await loadJournal(c.env,p.data.year,p.data.term,method==='post'))}catch(e){return apiError(c,502,'PLATONUS_JOURNAL',e instanceof PlatonusError?e.message:'Не удалось загрузить оценки Platonus. Попробуйте позже.')}
})
