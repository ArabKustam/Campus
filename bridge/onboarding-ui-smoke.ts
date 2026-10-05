import puppeteer from 'puppeteer'
import assert from 'node:assert/strict'
const browser=await puppeteer.launch({headless:true})
const page=await browser.newPage(),errors:string[]=[],writes:string[]=[]
page.on('pageerror',e=>errors.push(String(e)))
await page.setViewport({width:390,height:844,deviceScaleFactor:1})
await page.setRequestInterception(true)
let signed=false,onboarding=true,phase='disconnected'
const state=()=>({status:phase==='waiting'?'connected':phase,credentialsSaved:phase!=='disconnected',needsCode:false,lastSyncAt:null,initialImportDone:phase==='connected',retryAt:phase==='waiting'?Date.now()+300000:null,error:null,scheduleChanged:false})
page.on('request',req=>{
 const url=new URL(req.url());if(!url.pathname.startsWith('/api/')){void req.continue();return}
 const path=url.pathname;let data:unknown={},status=200
 if(req.method()!=='GET')writes.push(path)
 if(path==='/api/auth/me'){if(signed)data={id:'demo',login:'demo',displayName:'Demo'};else status=401}
 else if(path==='/api/auth/register'){signed=true;data={id:'demo',login:'demo',displayName:'Demo'}}
 else if(path==='/api/onboarding'){if(req.method()==='POST')onboarding=false;data={onboarding}}
 else if(path==='/api/platonus/connection')data=state()
 else if(path==='/api/platonus/login'){phase='waiting';data=state()}
 else if(path==='/api/schedule')data={slots:[],overrides:[]}
 else if(path==='/api/schedule/day')data={date:url.searchParams.get('date'),weekType:'even',weekNumber:2,lessons:[]}
 else if(path==='/api/platonus/umkd')data={section:{tables:[],links:[],error:null},capturedAt:null}
 else if(path==='/api/assistant')data=[]
 void req.respond({status,contentType:'application/json',body:JSON.stringify(status===401?{ok:false,error:{code:'AUTH_REQUIRED',message:'Войдите в аккаунт'}}:{ok:true,data})})
})
async function click(label:string){await page.waitForFunction(label=>[...document.querySelectorAll('button')].some(b=>b.textContent?.trim()===label),{polling:100},label);await page.evaluate(label=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()===label)!;b.click()},label)}
async function text(value:string){await page.waitForFunction(value=>document.body.innerText.includes(value),{polling:100},value)}
async function language(id:string){await page.evaluate(()=>{const buttons=[...document.querySelectorAll<HTMLButtonElement>('button[title="Language / Язык / Тіл"]')];buttons.find(b=>b.getClientRects().length)?.click()});await page.waitForSelector(`button[lang="${id}"]`);await page.click(`button[lang="${id}"]`)}
try{
 await page.goto('http://127.0.0.1:5174/',{waitUntil:'networkidle0'})
 await language('en');await text('Sign in to Campus');await click('Create account')
 await page.type('input[name="displayName"]','Demo');await page.type('input[name="login"]','demo');await page.type('input[name="password"]','demo-password-only')
 await language('kk');assert.equal(await page.$eval('input[name="password"]',el=>(el as HTMLInputElement).value),'demo-password-only')
 await language('en');await click('Create account')
 await text('Your university, in one place');assert.equal(await page.$eval('img[src="/platonus-logo.png"]',el=>(el as HTMLImageElement).naturalWidth>0),true)
 await page.screenshot({path:'qa-artifacts/onboarding-platonus-mobile.png',fullPage:true})
 await page.type('input[autocomplete="username"]','demo-university');await page.type('input[type="password"]','demo-university-password');await click('Connect Platonus')
 await text('Campus will retry in 5 minutes');assert.equal(await page.$('input[type="password"]'),null)
 phase='connected';await text('Meet Campus');await text('Your schedule');assert.equal(await page.evaluate(()=>document.body.innerText.includes('сентября')),false);await click('Next');await text('Hi, what can you do?');await click('Lesson example');await text('Physics is the second class')
 assert.equal(writes.filter(path=>path==='/api/assistant'||path.includes('/import')).length,0)
 await language('kk');await text('Алым аптасында жұма күні');await click('Келесі');await text('Материалдар әрқашан қолыңызда');await click('Аяқтау')
 await page.setViewport({width:320,height:740});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 assert.deepEqual(errors,[])
 console.log('PASS: registration, 3 languages, input preservation, retry state, automatic onboarding, safe AI demos, UMKD, mobile overflow')
}catch(error){console.log({errors,writes,body:await page.evaluate(()=>document.body.innerText)});throw error}finally{await browser.close()}
