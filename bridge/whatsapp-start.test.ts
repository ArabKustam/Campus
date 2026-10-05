import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { startWhatsApp } from './whatsapp-start.js'
test('retries aborted navigation, closes failed clients and waits for ready',async()=>{
 let made=0,destroyed=0;const retries:number[]=[]
 const client=await startWhatsApp(()=>{const attempt=++made;return new class extends EventEmitter {async initialize(){if(attempt<3)throw new Error('net::ERR_ABORTED at https://web.whatsapp.com/');queueMicrotask(()=>this.emit('ready'))}async destroy(){destroyed++}}},new AbortController().signal,n=>retries.push(n))
 assert.equal(made,3);assert.equal(destroyed,2);assert.deepEqual(retries,[2,3]);assert.equal(client.listenerCount('ready'),0)
})
test('does not retry authentication failures or erase sessions',async()=>{
 let made=0
 await assert.rejects(startWhatsApp(()=>{made++;return new class extends EventEmitter{async initialize(){this.emit('auth_failure')}async destroy(){}}},new AbortController().signal,()=>{}),/отклонил/)
 assert.equal(made,1)
})
test('aborting QR pairing cleans up',async()=>{
 const abort=new AbortController();let closed=false
 const pending=startWhatsApp(()=>new class extends EventEmitter{async initialize(){this.emit('qr');queueMicrotask(()=>abort.abort())}async destroy(){closed=true}},abort.signal,()=>{})
 await assert.rejects(pending,/отменено/);assert.equal(closed,true)
})
test('reports disconnect during initialization and cleans listeners',async()=>{
 const client=new class extends EventEmitter{async initialize(){this.emit('authenticated');this.emit('disconnected')}async destroy(){}}
 await assert.rejects(startWhatsApp(()=>client,new AbortController().signal,()=>{}),/разорвал/)
 assert.equal(client.listenerCount('authenticated'),0)
 assert.equal(client.listenerCount('disconnected'),0)
})
test('does not regress a ready client when initialize rejects afterwards',async()=>{
 const client=new class extends EventEmitter{async initialize(){this.emit('ready');throw new Error('r')}async destroy(){throw new Error('must not destroy')}}
 assert.equal(await startWhatsApp(()=>client,new AbortController().signal,()=>{}),client)
})
