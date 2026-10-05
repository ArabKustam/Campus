import puppeteer from 'puppeteer'
import assert from 'node:assert/strict'
const browser=await puppeteer.launch({headless:true}),page=await browser.newPage(),errors:string[]=[]
let admin=false;let completed:string[]=[]
page.on('pageerror',e=>errors.push(String(e)))
await page.setViewport({width:320,height:740});await page.setRequestInterception(true)
page.on('request',req=>{const u=new URL(req.url()),p=u.pathname;if(!p.startsWith('/api/')){void req.continue();return}let data:unknown={}
 if(p==='/api/auth/me')data={id:'test',login:'test',displayName:'Test',isAdmin:admin}
 else if(p==='/api/tutorial'){if(req.method()==='POST')completed=['library'];data={sections:completed}}
 else if(p==='/api/onboarding')data={onboarding:false}
 else if(p==='/api/platonus/connection')data={status:'connected',credentialsSaved:true,initialImportDone:true}
 else if(p==='/api/schedule')data={slots:[],overrides:[]}
 else if(p==='/api/schedule/day')data={date:u.searchParams.get('date'),weekType:'odd',weekNumber:3,lessons:[{scheduleSlotId:'lesson',slotNumber:1,subjectName:'Очень длинное название предмета',teacherName:'Преподаватель с длинной фамилией',startTime:'09:00',endTime:'10:45',status:'cancelled',room:'420',building:'Главный корпус',lessonType:'Лекция',hasHomework:1}]}
 else if(p==='/api/notifications')data={items:[],unread:0}
 else if(p==='/api/admin/accounts'){void req.respond({status:403,contentType:'application/json',body:JSON.stringify({ok:false,error:{code:'ADMIN_LOCKED',message:'Нужно подтверждение'}})});return}
 void req.respond({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data})})})
async function click(label:string){await page.waitForFunction(label=>[...document.querySelectorAll('button')].some(b=>(b.textContent?.trim()===label||b.getAttribute('aria-label')===label)&&b.getClientRects().length&&!b.disabled),{},label);await page.evaluate(label=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>(b.textContent?.trim()===label||b.getAttribute('aria-label')===label)&&b.getClientRects().length&&!b.disabled)!.click(),label)}
try{
 await page.goto('http://127.0.0.1:5174/',{waitUntil:'networkidle0'});await click('Неделя');await page.waitForSelector('section[aria-label="Расписание на неделю"]');assert.ok(await page.$eval('section[aria-label="Расписание на неделю"]',el=>[...el.querySelectorAll('*')].some(n=>n.scrollWidth>n.clientWidth&&getComputedStyle(n).overflowX==='auto')));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(!(await page.evaluate(()=>document.body.innerText)).includes('Есть задание'));await page.screenshot({path:'qa-artifacts/week-mobile-2026-09-17.png'});await click('Как на ПК');await page.waitForSelector('section[data-week-layout="fit"]');assert.equal(await page.$eval('section[data-week-layout="fit"] [role="region"]',el=>el.scrollWidth<=el.clientWidth),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'qa-artifacts/week-fit-mobile-2026-09-17.png'})
 await click('Ещё');const nav=await page.$eval('aside',e=>e.textContent);assert.ok(!nav?.includes('Задания'));assert.ok(!nav?.includes('Администрирование'));await click('Настройки');assert.ok(!(await page.evaluate(()=>document.body.innerText)).includes('Telegram'));await click('Как установить');await page.waitForSelector('[role=dialog][aria-label="Campus на главном экране"]');await page.keyboard.press('Escape')
 await page.evaluate(()=>sessionStorage.setItem('campus-active-page','library'));await page.reload({waitUntil:'networkidle0'});await click('Как пользоваться');await click('Завершить');await page.evaluate(()=>sessionStorage.setItem('campus-active-page','library'));await page.reload({waitUntil:'networkidle0'});assert.ok(!(await page.evaluate(()=>document.body.innerText)).includes('Как пользоваться'))
 admin=true;await page.goto('http://127.0.0.1:5174/admin',{waitUntil:'networkidle0'});await page.waitForFunction(()=>document.body.innerText.includes('Получить код'));assert.equal(await page.$('[role=dialog]'),null);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[])
 console.log('PASS: 320px week grid scroll, ordinary feature visibility, install guide on demand, section tutorial completion, separate locked admin page.')
}finally{await browser.close()}
