import {env} from 'cloudflare:workers'
import {expect,it} from 'vitest'
import {app} from '../app'
it('keeps experimental endpoints private while allowing the ordinary schedule and UMKD',async()=>{
 const bindings={...env,ADMIN_ACCOUNT_ID:'admin',OWNER_ID:'student'}
 for(const path of ['/homework','/personal/telegram','/people','/messages','/processing','/connector/config'])expect((await app.request('https://campus.test/api'+path,{},bindings)).status,path).toBe(403)
 expect((await app.request('https://campus.test/api/schedule/day?date=2026-09-18',{},bindings)).status).toBe(200)
 expect((await app.request('https://campus.test/api/catalog',{},bindings)).status).toBe(200)
 expect((await app.request('https://campus.test/api/homework',{}, {...bindings,OWNER_ID:'admin'})).status).toBe(200)
})
