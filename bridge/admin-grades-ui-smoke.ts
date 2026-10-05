import puppeteer from 'puppeteer'
import assert from 'node:assert/strict'

const browser=await puppeteer.launch({headless:true}),page=await browser.newPage(),errors:string[]=[]
page.on('pageerror',error=>errors.push(String(error)))
await page.setViewport({width:390,height:844});await page.setRequestInterception(true)
page.on('request',request=>{const url=new URL(request.url()),path=url.pathname;if(!path.startsWith('/api/')){void request.continue();return}let data:unknown={}
 if(path==='/api/auth/me')data={id:'owner',login:'owner',displayName:'Owner',isAdmin:true}
 else if(path==='/api/tutorial')data={sections:['schedule','assistant','library']}
 else if(path==='/api/onboarding')data={onboarding:false}
 else if(path==='/api/platonus/connection')data={status:'connected',credentialsSaved:true,initialImportDone:true,scheduleChanged:false}
 else if(path==='/api/schedule')data={slots:[],overrides:[]}
 else if(path==='/api/admin/accounts')data={items:[],total:24,matched:24,groups:[]}
 else if(path==='/api/admin/audit')data=[]
 else if(path==='/api/admin/analytics')data={online:3,summary:[{kind:'page.view',count:83,users:18},{kind:'document.open',count:12,users:5}],pages:[{page:'schedule',count:50,users:16},{page:'grades',count:20,users:9},{page:'library',count:13,users:7}],devices:[{device:'phone',browser:'Chrome',count:60},{device:'desktop',browser:'Chrome',count:23}],daily:Array.from({length:7},(_,i)=>({day:`2026-09-${String(15+i).padStart(2,'0')}`,views:5+i*2,users:3+i,registrations:i%3})),events:[]}
 else if(path==='/api/notifications')data={items:[{id:'grade:1',type:'grade',title:'Новая оценка',body:'Математика · РК 1: 90',original:'2026 учебный год · семестр 1',study_year:2026,term:1,created_at:Date.now(),read_at:null}],unread:1}
 else if(path==='/api/platonus/grades/options')data={years:[{id:2026,label:'2026–2027'}],terms:[{id:1,label:'1 семестр'}],defaultYear:2026,defaultTerm:1}
 else if(path==='/api/platonus/grades')data={year:2026,term:1,capturedAt:new Date().toISOString(),subjects:[]}
 void request.respond({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data})})
})
async function click(label:string){await page.waitForFunction(label=>[...document.querySelectorAll<HTMLButtonElement>('button')].some(button=>(button.textContent?.trim()===label||button.getAttribute('aria-label')?.startsWith(label))&&button.getClientRects().length),{},label);await page.evaluate(label=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(button=>(button.textContent?.trim()===label||button.getAttribute('aria-label')?.startsWith(label))&&button.getClientRects().length)!.click(),label)}
try{
 await page.goto('http://127.0.0.1:5174/admin',{waitUntil:'networkidle0'});await page.waitForFunction(()=>document.body.innerText.includes('Посещения по дням'));assert.equal(await page.$$eval('svg[role="img"]',items=>items.length),3);assert.ok((await page.evaluate(()=>document.body.innerText)).includes('Популярные разделы'));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'qa-artifacts/admin-charts-mobile.png',fullPage:true})
 await click('Ещё');await click('Уведомления');await page.waitForFunction(()=>document.body.innerText.includes('Математика · РК 1: 90'));assert.ok((await page.evaluate(()=>document.body.innerText)).includes('Новая оценка'));await click('Открыть оценки');await page.waitForFunction(()=>document.querySelector('h1')?.textContent?.includes('Оценки'));assert.deepEqual(errors,[])
 console.log('PASS: admin charts and grade notification navigation at 390px.')
}finally{await browser.close()}
