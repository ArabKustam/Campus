import puppeteer from 'puppeteer'
import assert from 'node:assert/strict'
const browser=await puppeteer.launch({headless:true}),page=await browser.newPage()
const errors:string[]=[],writes:string[]=[]
const stream1='BT /F1 18 Tf 30 350 Td (Campus PDF test) Tj ET',stream2='BT /F1 18 Tf 30 350 Td (Second page) Tj ET'
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream1.length} >>\nstream\n${stream1}\nendstream`,`<< /Length ${stream2.length} >>\nstream\n${stream2}\nendstream`]
let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((obj,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`});const xref=pdf.length;pdf+=`xref\n0 8\n0000000000 65535 f \n${offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
page.on('pageerror',e=>errors.push(String(e)))
await page.setViewport({width:320,height:720});await page.setRequestInterception(true)
page.on('request',req=>{
 const url=new URL(req.url()),path=url.pathname
 if(!path.startsWith('/api/')){void req.continue();return}
 if(req.method()!=='GET')writes.push(path)
 let data:unknown={}
 if(path==='/api/auth/me')data={id:'demo',login:'demo',displayName:'Demo'}
 else if(path==='/api/tutorial')data={sections:[]}
 else if(path==='/api/onboarding')data={onboarding:false}
 else if(path==='/api/platonus/connection')data={status:'connected',credentialsSaved:true,initialImportDone:true}
 else if(path==='/api/notifications')data={items:[{id:'reply1',type:'support',ticket_id:'t1',body:'Спасибо, исправлено!',original:'Документ не видно на телефоне',created_at:Date.now(),read_at:null}],unread:1,unreadByType:{grade:0,support:1}}
 else if(path==='/api/support'&&req.method()==='GET')data={tickets:[{id:'t1',kind:'bug',body:'Документ не видно на телефоне',page:'library',created_at:Date.now()-60000,delivered:true,replies:[{id:'reply1',body:'Спасибо, исправлено!',created_at:Date.now(),read_at:null}]}]}
 else if(path==='/api/platonus/umkd')data={capturedAt:new Date().toISOString(),section:{links:[{url:'https://platonus.kstu.kz/studentUmkd/123',title:'Очень длинное название дисциплины с учебными материалами'}]}}
 else if(path==='/api/platonus/umkd/123/files')data=[{id:2,name:'Силлабус'},{id:3,name:'Конспекты лекций'},{id:1,name:'Учебная программа.pdf'},{id:4,name:'Материалы для рубежного контроля'}]
 else if(path==='/api/platonus/umkd/123/files/1'){void req.respond({status:200,contentType:'application/pdf',body:Buffer.from(pdf)});return}
 void req.respond({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data})})
})
await page.evaluateOnNewDocument(()=>sessionStorage.setItem('campus-active-page','library'))
async function button(label:string){await page.waitForFunction(label=>[...document.querySelectorAll('button')].some(b=>(b.textContent?.trim().startsWith(label)||b.getAttribute('aria-label')===label)&&!b.hasAttribute('data-dialog-backdrop')&&b.getClientRects().length),{},label);await page.evaluate(label=>[...document.querySelectorAll('button')].find(b=>(b.textContent?.trim().startsWith(label)||b.getAttribute('aria-label')===label)&&!b.hasAttribute('data-dialog-backdrop')&&b.getClientRects().length)!.click(),label)}
try{
 await page.goto('http://127.0.0.1:5174/',{waitUntil:'networkidle0'})
 await button('Очень длинное название дисциплины с учебными материалами')
 await page.waitForSelector('[role="dialog"]');assert.ok((await page.$$('[role="dialog"] button')).length>=5);await button('Учебная программа.pdf')
 await page.waitForSelector('canvas[aria-label$="· 1"]:not(.hidden)')
 assert.equal(await page.$$eval('[data-pdf-page]',pages=>pages.length),2)
 await page.$eval('[data-pdf-page="2"]',el=>el.scrollIntoView({block:'center'}));await page.waitForSelector('canvas[aria-label$="· 2"]:not(.hidden)');await page.waitForFunction(()=>document.querySelector<HTMLInputElement>('input[aria-label="Номер страницы"]')?.value==='2')
 await page.click('input[aria-label="Номер страницы"]',{clickCount:3});await page.type('input[aria-label="Номер страницы"]','1');await page.keyboard.press('Enter');await page.waitForFunction(()=>{const canvas=document.querySelector('canvas[aria-label$="· 1"]');if(!canvas)return false;const r=canvas.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0});assert.equal(await page.$eval('input[aria-label="Номер страницы"]',input=>(input as HTMLInputElement).value),'1')
 const visible=await page.$eval('canvas[aria-label$="· 1"]',el=>{const r=el.getBoundingClientRect();return r.top<window.innerHeight&&r.bottom>0})
 assert.ok(visible);await page.screenshot({path:'qa-artifacts/pdf-mobile.png'});assert.ok(await page.$eval('#main-content',el=>el.closest('[inert]')!==null))
 await page.keyboard.press('Escape');await button('Закрыть')
 await button('Ещё');await button('Уведомления · непрочитанных: 1')
 await page.waitForFunction(()=>document.querySelector('[role="dialog"] h2')?.textContent?.startsWith('Уведомления'))
 assert.ok((await page.$eval('[role="dialog"]',el=>el.textContent)).includes('Спасибо, исправлено!'));assert.ok(!writes.includes('/api/notifications/read'))
 await button('Ответ разработчика');await page.waitForSelector('#ticket-t1')
 await button('Написать разработчику');await page.type('textarea','При открытии документа нужно показать его сразу.')
 await button('Отправить');await page.waitForFunction(()=>document.body.textContent?.includes('Обращение отправлено'))
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 await page.keyboard.press('Escape')
 assert.equal(await page.$('[role="dialog"]'),null)
 assert.deepEqual(errors,[]);assert.ok(writes.includes('/api/support'));assert.ok(writes.includes('/api/notifications/read'))
 assert.ok(writes.every(path=>['/api/support','/api/notifications/read','/api/activity/event','/api/activity'].includes(path)))
 console.log('Mobile UMKD modal, developer reply, feedback submission, focus/Escape and 320px width passed; all requests mocked.')
}finally{await browser.close()}
