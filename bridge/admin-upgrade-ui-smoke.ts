import puppeteer from 'puppeteer'
import assert from 'node:assert/strict'
const browser=await puppeteer.launch({headless:true}),page=await browser.newPage(),errors:string[]=[]
let owner=true,permissionWrites=0
const today=new Date(Date.now()+5*3600000).toISOString().slice(0,10)
page.on('pageerror',e=>errors.push(String(e)))
await page.setRequestInterception(true)
page.on('request',r=>{const u=new URL(r.url()),p=u.pathname;if(!p.startsWith('/api/')){void r.continue();return}let data:unknown={}
 if(p==='/api/auth/me')data={id:owner?'owner':'student',login:owner?'owner':'student',displayName:'Тестовый пользователь',isAdmin:owner,features:[]}
 else if(p==='/api/groups')data={group:null,onboarding:false}
 else if(p==='/api/onboarding')data={onboarding:false}
 else if(p==='/api/tutorial')data={sections:['schedule','assistant','library']}
 else if(p==='/api/platonus/connection')data={status:'connected',credentialsSaved:true,initialImportDone:true,scheduleChanged:false}
 else if(p==='/api/schedule')data={slots:[],overrides:[]}
 else if(p==='/api/notifications')data={items:[],unread:0}
 else if(p==='/api/admin/accounts')data={items:[{id:'student',login:'student',displayName:'Студент',platonusName:'Аружан Тестова',platonusGroup:'ИС-24-1',platonusConnected:true,createdAt:new Date().toISOString(),visibleMs:420000,features:[]}],total:24,matched:1,groups:[{name:'ИС-24-1'}]}
 else if(p==='/api/admin/audit')data=[]
 else if(p.endsWith('/permissions')){permissionWrites++;data={features:['ai']}}
 else if(p==='/api/admin/storage')data={items:[{kind:'account',bytes:52e6,count:24,oldest:Date.now()},{kind:'archive',bytes:20e6,count:3,oldest:Date.now()}],accounts:24,freePlanLimitBytes:5*1024**3,workspaceLimitBytes:1024**3}
 else if(p==='/api/admin/analytics/detail')data={users:[{account_id:'student',login:'student',name:'Аружан Тестова',firstAt:Date.now()-420000,lastAt:Date.now(),visibleMs:420000,pages:'schedule,library',events:3}],hourly:[{hour:'10',views:12,users:3}],events:[{id:'one',login:'student',created_at:Date.now(),page:'library',kind:'document.open',detail:'Силлабус',device:'phone',browser:'Chrome'}]}
 else if(p==='/api/admin/analytics')data={online:3,summary:[{kind:'page.view',count:83,users:18}],pages:[{page:'schedule',count:50,users:16},{page:'library',count:13,users:7}],devices:[{device:'phone',browser:'Chrome',count:60},{device:'desktop',browser:'Chrome',count:23}],daily:[{day:today,views:20,users:12,registrations:3}],events:[]}
 void r.respond({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data})})
})
async function click(label:string){await page.waitForFunction(label=>[...document.querySelectorAll<HTMLButtonElement>('button')].some(b=>(b.textContent?.trim()===label||b.getAttribute('aria-label')===label)&&b.getClientRects().length),{},label);await page.evaluate(label=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>(b.textContent?.trim()===label||b.getAttribute('aria-label')===label)&&b.getClientRects().length)!.click(),label)}
try{
 for(const width of [390,1280]){
  await page.setViewport({width,height:900});await page.goto('http://127.0.0.1:5174/admin',{waitUntil:'networkidle0'});await page.waitForSelector('svg g[role="button"]');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  await page.screenshot({path:`qa-artifacts/admin-upgrade-${width}.png`,fullPage:true})
  await page.$eval('svg g[role="button"]:last-of-type',g=>g.dispatchEvent(new MouseEvent('click',{bubbles:true})));await page.waitForFunction(()=>document.body.innerText.includes('7 мин 0 с'));assert.ok((await page.evaluate(()=>document.body.innerText)).includes('Силлабус'));await click('Закрыть')
  await click('Пользователи · 24');await page.waitForSelector('details.group summary');await page.$eval('details.group summary',e=>(e as HTMLElement).click());await click('Права');await page.waitForSelector('[role="dialog"] input[type="checkbox"]');await page.click('[role="dialog"] input[type="checkbox"]');await click('Сохранить права');await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'))
  await click('Хранилище');await page.waitForSelector('progress');assert.ok((await page.evaluate(()=>document.body.innerText)).includes('5 ГБ'))
 }
 assert.equal(permissionWrites,2)
 owner=false;await page.goto('http://127.0.0.1:5174/',{waitUntil:'networkidle0'});assert.equal(await page.$('button[aria-label="AI-помощник"]'),null);assert.equal(await page.$('button[aria-label="Моя группа"]'),null)
 assert.deepEqual(errors,[]);console.log('PASS: desktop/mobile admin drilldown, user permissions, storage and hidden student features')
}finally{await browser.close()}
