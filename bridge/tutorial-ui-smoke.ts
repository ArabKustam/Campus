import puppeteer from 'puppeteer'
import assert from 'node:assert/strict'
const browser=await puppeteer.launch({headless:true}),page=await browser.newPage()
const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)))
await page.setViewport({width:Number(process.env.QA_WIDTH)||390,height:Number(process.env.QA_HEIGHT)||844});await page.setRequestInterception(true)
page.on('request',req=>{
 const url=new URL(req.url());if(!url.pathname.startsWith('/api/')){void req.continue();return}
 let data:unknown={};const path=url.pathname
 if(path==='/api/auth/me')data={id:'demo',login:'demo',displayName:'Demo'}
 else if(path==='/api/tutorial')data={sections:[]}
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
await page.evaluateOnNewDocument(()=>sessionStorage.setItem('campus-start-tour','1'))
const writes:string[]=[];page.on('request',req=>{if(new URL(req.url()).pathname.startsWith('/api/')&&req.method()!=='GET')writes.push(req.url())})
async function textButton(label:string){await page.waitForFunction(label=>[...document.querySelectorAll<HTMLButtonElement>('button')].some(b=>b.textContent?.trim()===label&&!b.disabled&&b.getClientRects().length),{},label);await page.evaluate(label=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label&&!b.disabled&&b.getClientRects().length)!.click(),label)}
async function spotlight(target:string){await page.waitForFunction(target=>document.querySelector('[data-tour-spotlight]')?.getAttribute('data-tour-spotlight')===target,{},target);assert.equal(await page.evaluate(target=>{const subject=document.querySelector(target)!.getBoundingClientRect(),light=document.querySelector('[data-tour-spotlight]')!.getBoundingClientRect();return Math.abs(subject.left-light.left)<=6&&Math.abs(subject.top-light.top)<=6&&Math.abs(subject.width-light.width)<=12&&Math.abs(subject.height-light.height)<=12},target),true)}
try{
 await page.goto('http://127.0.0.1:5174/',{waitUntil:'networkidle0'})
 await textButton('Неделя');await textButton('День');await textButton('Далее')
 await textButton('Редактировать');await page.waitForSelector('input');await page.$eval('input',el=>{const input=el as HTMLInputElement;input.select()});await page.type('input','420');await textButton('Сохранить');await textButton('Редактировать');await textButton('Добавить пару · 3');await textButton('Добавить');await page.waitForSelector('[data-demo-added="true"]');await textButton('Далее')
 await page.waitForSelector('[role="progressbar"]');assert.equal(await page.$eval('[role="progressbar"]',el=>Number(el.getAttribute('aria-valuenow'))>=35),true)
 const before=await page.$eval('[role=progressbar]>div',el=>el.getBoundingClientRect().width);await new Promise(r=>setTimeout(r,1000));const after=await page.$eval('[role=progressbar]>div',el=>el.getBoundingClientRect().width);assert.ok(after>before+3,`Progress must move: ${before} -> ${after}`);await page.waitForFunction(()=>document.querySelector('[data-tour=live-timer]')?.textContent?.includes('Перемена'));console.log('TIMER_STYLE',await page.$eval('[role=progressbar]>div',el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,color:getComputedStyle(el).backgroundColor,parent:el.parentElement!.getBoundingClientRect().toJSON()})));assert.ok(await page.$eval('[role=progressbar]>div',el=>el.getBoundingClientRect().height>=4&&getComputedStyle(el).backgroundColor!==getComputedStyle(el.parentElement!).backgroundColor));assert.ok(await page.$eval('[data-tour=live-timer]',el=>el.getBoundingClientRect().bottom<document.querySelector('[aria-label="Подсказка обучения"]')!.getBoundingClientRect().top),'Coach must not obscure the timer');await page.screenshot({path:'qa-artifacts/tutorial-timer-mobile.png'});
 await textButton('Далее');await textButton('Далее')
 await page.waitForFunction(()=>document.querySelector('textarea')?.value.includes('Привет'))
 await button('Пауза');const draft=await page.$eval('textarea',el=>el.value);await new Promise(resolve=>setTimeout(resolve,500));assert.equal(await page.$eval('textarea',el=>el.value),draft);await button('Продолжить')
 await page.waitForFunction(()=>document.querySelector('[role="log"]')?.textContent?.includes('Я помогу с расписанием'))
 assert.equal(await page.$eval('textarea',el=>el.getBoundingClientRect().bottom<innerHeight-60),true)
 await page.screenshot({path:'qa-artifacts/tutorial-chat-mobile.png',fullPage:true})
 await textButton('Далее')
 await page.waitForSelector('[data-demo-lesson="physics"][data-cancelled="false"]')
 await spotlight('[data-demo-lesson=physics]')
 await page.waitForSelector('[data-demo-lesson="physics"][data-cancelled="true"]')
 await new Promise(resolve=>setTimeout(resolve,1100));await page.screenshot({path:'qa-artifacts/tutorial-cancel-mobile.png',fullPage:true})
 await textButton('Далее');await page.waitForSelector('[data-demo-added="true"]');await spotlight('[data-demo-slot=third]');await textButton('Далее')
 await page.waitForFunction(()=>document.body.innerText.includes('Все 2 изменения отменены.'))
 await spotlight('[data-demo-undo-summary]')
 assert.equal(await page.$('[data-demo-homework]'),null);assert.equal(await page.$eval('[data-demo-lesson="physics"]',el=>el.getAttribute('data-cancelled')),'false')
 await textButton('Далее');await textButton('Завершить');assert.ok(writes.every(url=>/\/api\/(activity|tutorial)/.test(url)),JSON.stringify(writes))
 await button('Открыть меню');await button('Оценки');await page.waitForSelector('select');await page.select('select','2025');await page.waitForFunction(()=>document.body.innerText.includes('Әбдірахманова'))
 await page.setViewport({width:320,height:740});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 await textButton('Калькулятор оценок');await page.waitForSelector('[role="dialog"][aria-label="Калькулятор оценок"]');await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('[role="dialog"][aria-label="Калькулятор оценок"]'))
 await page.screenshot({path:'qa-artifacts/grade-circles-mobile.png',fullPage:true})
 assert.deepEqual(errors,[]);console.log('PASS: manual editor, day/week, live progress, typed chat and reply, cancel/add/undo, no schedule mutations, circles at 320px, calculator dialog Escape')
}catch(e){console.log({errors,writes,body:await page.evaluate(()=>document.body.innerText)});throw e}finally{await browser.close()}
