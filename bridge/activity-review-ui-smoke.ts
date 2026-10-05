import puppeteer from 'puppeteer'
import assert from 'node:assert/strict'
const browser=await puppeteer.launch({headless:true}),page=await browser.newPage()
const errors:string[]=[],writes:string[]=[]
let guide=false,claimed=false,ack=false
page.on('pageerror',e=>errors.push(String(e)))
await page.setViewport({width:390,height:844});await page.setUserAgent('Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36')
await page.setRequestInterception(true)
page.on('request',req=>{
 const path=new URL(req.url()).pathname;if(!path.startsWith('/api/')){void req.continue();return}
 if(req.method()!=='GET')writes.push(path)
 let data:unknown={}
 if(path==='/api/auth/me')data={id:'demo',login:'demo',displayName:'Demo'}
 else if(path==='/api/onboarding')data={onboarding:false}
 else if(path==='/api/notifications')data={items:[],unread:0}
 else if(path==='/api/activity')data={showInstall:guide&&!claimed,installRequest:0}
 else if(path==='/api/activity/install-shown'){claimed=true;data={claimed:true}}
 else if(path==='/api/platonus/connection')data={status:'connected',credentialsSaved:true,scheduleChanged:!ack}
 else if(path==='/api/platonus/acknowledge'){assert.equal(JSON.parse(req.postData()!).snapshotId,'snapshot-demo');ack=true}
 else if(path==='/api/platonus')data={snapshot:{id:'snapshot-demo',capturedAt:new Date().toISOString()},campusOnly:[],rows:[{index:0,status:'update',weekType:'even',revision:'r',collisions:[],existing:{subject:'Культурология',teacher:'Тестовый преподаватель',room:'352'},lesson:{weekday:5,slotNumber:1,subject:'Культурология',startTime:'09:00',endTime:'10:45',teacher:'Тестовый преподаватель',room:'420'}}]}
 void req.respond({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data})})
})
await page.evaluateOnNewDocument(()=>sessionStorage.setItem('campus-active-page','settings'))
async function button(text:string){await page.waitForFunction(text=>[...document.querySelectorAll('button')].some(b=>b.textContent?.trim()===text&&!b.disabled&&b.getClientRects().length),{},text);await page.evaluate(text=>[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()===text&&!b.disabled&&b.getClientRects().length)!.click(),text)}
try{
 await page.goto('http://127.0.0.1:5174/',{waitUntil:'networkidle0'});await button('Проверить изменения')
 await page.waitForSelector('[role="dialog"]');assert.ok((await page.$eval('[role="dialog"]',e=>e.textContent))?.includes('Сейчас в Campus'))
 assert.equal(ack,false);assert.ok(!writes.includes('/api/platonus/import'))
 await page.screenshot({path:'qa-artifacts/schedule-changes-mobile.png'})
 await button('Оставить моё расписание и убрать уведомление');assert.equal(ack,true)
 await page.waitForSelector('[role="dialog"]',{hidden:true})
 guide=true;await page.reload({waitUntil:'networkidle0'})
 await page.waitForSelector('[role="dialog"][aria-label="Campus на главном экране"]');assert.ok(claimed)
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 await page.screenshot({path:'qa-artifacts/install-guide-mobile.png'});await button('Понятно')
 await page.reload({waitUntil:'networkidle0'});assert.equal(await page.$('[role="dialog"]'),null)
 assert.deepEqual(errors,[]);console.log('Mobile schedule comparison, explicit acknowledgement, zero schedule mutations, and one-time installation guide passed.')
}finally{await browser.close()}
