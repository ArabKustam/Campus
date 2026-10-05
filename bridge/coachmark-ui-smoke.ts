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
 else if(path==='/api/platonus/grades')data={year:Number(url.searchParams.get('year')),term:Number(url.searchParams.get('term')),capturedAt:new Date().toISOString(),subjects:url.searchParams.get('year')==='2025'?[{id:1,name:'Қазақ тілі және кәсіби коммуникация — очень длинное название предмета',teacher:'Әбдірахманова Әлия Нұрмұхамедқызы',score:'85',finalScore:'0',exams:[{name:'Рейтинг',mark:'80',typeId:2},{name:'Экзамен',mark:'92',typeId:1}]}]:[]}
 void req.respond({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data})})
})
async function visibleClick(selector:string){for(const el of await page.$$(selector)){if(await el.boundingBox()){await el.focus();await el.evaluate(b=>(b as HTMLButtonElement).click());return}}throw new Error('No visible '+selector)}
async function button(label:string){await page.waitForSelector(`button[aria-label="${label}"]:not([data-dialog-backdrop])`);await visibleClick(`button[aria-label="${label}"]:not([data-dialog-backdrop])`)}
await page.evaluateOnNewDocument(()=>sessionStorage.setItem('campus-start-tour','1'))
const writes:string[]=[];page.on('request',req=>{if(new URL(req.url()).pathname.startsWith('/api/')&&req.method()!=='GET')writes.push(req.url())})
async function textButton(label:string){await page.waitForFunction(label=>[...document.querySelectorAll<HTMLButtonElement>('button')].some(b=>b.textContent?.trim()===label&&!b.disabled&&b.getClientRects().length),{},label);await page.evaluate(label=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label&&!b.disabled&&b.getClientRects().length)!.click(),label)}
try{
 await page.goto('http://127.0.0.1:5174/',{waitUntil:'networkidle0'})
 await page.waitForSelector('[aria-label="Подсказка обучения"]')
 const separated=await page.evaluate(()=>{const a=document.querySelector('[data-tour="modes"]')!.getBoundingClientRect(),b=document.querySelector('[aria-label="Подсказка обучения"]')!.getBoundingClientRect();return a.bottom<=b.top||b.bottom<=a.top});assert.equal(separated,true)
 await page.screenshot({path:'qa-artifacts/coachmark-mobile.png',fullPage:true})
 await textButton('Далее');await page.click('[data-tour="edit"]');await page.waitForSelector('form input')
 await page.screenshot({path:'qa-artifacts/coachmark-edit-mobile.png',fullPage:true})
 await textButton('Сохранить');await textButton('Далее');await page.waitForSelector('[role="progressbar"]');const start=await page.$eval('[role="progressbar"]',el=>Number(el.getAttribute('aria-valuenow')));await new Promise(r=>setTimeout(r,1100));const finish=await page.$eval('[role="progressbar"]',el=>Number(el.getAttribute('aria-valuenow')));assert.ok(finish-start>=4)
 await page.waitForFunction(()=>document.querySelector('[data-tour="live-timer"]')?.textContent?.includes('Перемена · продолжим через'),{timeout:10000})
 assert.equal(await page.$eval('[data-tour-spotlight]',el=>el.getAttribute('data-tour-spotlight')),'[data-tour=live-timer]')
 assert.ok((await page.$eval('[data-tour="live-timer"]',el=>el.textContent)).includes('Прошло'))
 await textButton('Далее');await page.click('[data-tour="teacher"]');await page.waitForSelector('img[src="/demo-teacher.svg"]');assert.equal(await page.$eval('img[src="/demo-teacher.svg"]',el=>(el as HTMLImageElement).naturalWidth>0),true);await page.screenshot({path:'qa-artifacts/demo-teacher-mobile.png',fullPage:true});await textButton('Понятно, продолжить обучение')
 await button('Закрыть');assert.deepEqual(writes,[])
 await button('Открыть меню');await button('Оценки');await page.waitForSelector('select');await page.select('select','2025');await page.waitForFunction(()=>document.body.innerText.includes('Әбдірахманова'));await textButton('Калькулятор оценок');await page.waitForSelector('[role="dialog"]')
 assert.equal(await page.$eval('[role="dialog"] input',el=>(el as HTMLInputElement).value),'80')
 await page.screenshot({path:'qa-artifacts/calculator-autofill-mobile.png',fullPage:true});assert.ok((await page.$eval('[role="status"]',el=>el.textContent))?.includes('67.5'));await page.keyboard.press('Escape');assert.deepEqual(errors,[]);console.log('PASS: anchored coachmark, manual edit, 5x demo clock, fictional profile image, zero writes, rating autofill 80 -> exam 67.5, Escape')
}catch(e){console.log({errors,writes,body:await page.evaluate(()=>document.body.innerText)});throw e}finally{await browser.close()}
