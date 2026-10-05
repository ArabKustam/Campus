import puppeteer from 'puppeteer'
import assert from 'node:assert/strict'
const browser=await puppeteer.launch({headless:true}),page=await browser.newPage()
const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)))
await page.setViewport({width:390,height:844});await page.setRequestInterception(true)
page.on('request',req=>{
 const url=new URL(req.url());if(!url.pathname.startsWith('/api/')){void req.continue();return}
 let data:unknown={};const path=url.pathname
 if(path==='/api/auth/me')data={id:'demo',login:'demo',displayName:'Demo'}
 else if(path==='/api/onboarding')data={onboarding:false}
 else if(path==='/api/platonus/connection')data={status:'connected',credentialsSaved:true,initialImportDone:true}
 else if(path==='/api/schedule')data={slots:[],overrides:[]}
 else if(path==='/api/schedule/day')data={date:url.searchParams.get('date'),weekType:'even',weekNumber:2,lessons:[]}
 else if(path==='/api/platonus/grades/options')data={years:[{id:2025,label:'2025–2026'},{id:2026,label:'2026–2027'}],terms:[{id:1,label:'1'},{id:2,label:'2'},{id:0,label:'Дополнительный академический период'}],defaultYear:2026,defaultTerm:1}
 else if(path==='/api/platonus/grades')data={year:Number(url.searchParams.get('year')),term:Number(url.searchParams.get('term')),capturedAt:new Date().toISOString(),subjects:url.searchParams.get('year')==='2025'?[{id:1,name:'Қазақ тілі және кәсіби коммуникация — очень длинное название предмета',teacher:'Әбдірахманова Әлия Нұрмұхамедқызы',score:'85',finalScore:'0',exams:[{name:'Экзамен',mark:'92',typeId:1}]}]:[]}
 void req.respond({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data})})
})
async function visibleClick(selector:string){for(const el of await page.$$(selector)){if(await el.boundingBox()){await el.focus();await el.evaluate(b=>(b as HTMLButtonElement).click());return}}throw new Error('No visible '+selector)}
async function button(label:string){await page.waitForSelector(`button[aria-label="${label}"]:not([data-dialog-backdrop])`);await visibleClick(`button[aria-label="${label}"]:not([data-dialog-backdrop])`)}
try{
 await page.goto('https://campus-planner.mymemory9.workers.dev/',{waitUntil:'networkidle0'})
 await button('Открыть меню');await button('Оценки');await page.waitForSelector('select');await page.select('select','2025');await page.waitForFunction(()=>document.body.innerText.includes('Әбдірахманова'))
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 await page.screenshot({path:'qa-artifacts/journal-mobile.png',fullPage:true})
 await page.setViewport({width:320,height:740});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 await button('Открыть меню');await visibleClick('button[title="Language / Язык / Тіл"]');await page.click('button[lang="en"]');await button('Close menu')
 await page.waitForFunction(()=>document.body.innerText.includes('Academic year'))
 await page.waitForFunction(()=>[...document.querySelectorAll('button[title="Language / Язык / Тіл"]')].filter(b=>b.getClientRects().length).length===0)
 await page.setViewport({width:1280,height:900});await visibleClick('button[title="Language / Язык / Тіл"]');await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('button[title="Language / Язык / Тіл"]')?.getAttribute('aria-expanded')==='false')
 await page.screenshot({path:'qa-artifacts/journal-desktop.png',fullPage:true})
 assert.deepEqual(errors,[]);console.log('PASS: year selection, zero marks, 320/390px overflow, mobile/sidebar language, English, keyboard Escape, desktop')
}catch(e){console.log({errors,body:await page.evaluate(()=>document.body.innerText)});throw e}finally{await browser.close()}
