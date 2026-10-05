import puppeteer from 'puppeteer'
import assert from 'node:assert/strict'
const browser=await puppeteer.launch({headless:true}),page=await browser.newPage()
let unlocked=false,deleted=false
const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)))
await page.setViewport({width:390,height:844});await page.setRequestInterception(true)
page.on('request',req=>{
 const url=new URL(req.url()),path=url.pathname;if(!path.startsWith('/api/')){void req.continue();return}
 let data:unknown={},status=200
 if(path==='/api/auth/me')data={id:'owner',login:'owner',displayName:'Owner',isAdmin:true}
 else if(path==='/api/onboarding')data={onboarding:false}
 else if(path==='/api/notifications')data={items:[],unread:0}
 else if(path==='/api/platonus/connection')data={status:'disconnected',credentialsSaved:false}
 else if(path==='/api/admin/unlock'){unlocked=true;data={unlocked:true}}
 else if(path==='/api/admin/accounts/test'&&req.method()==='DELETE'){assert.equal(JSON.parse(req.postData()!).confirmLogin,'test');deleted=true}
 else if(path==='/api/admin/accounts'){if(!unlocked)status=403;else data={total:deleted?1:2,items:deleted?[]:[{id:'test',login:'test',displayName:'Тестовый пользователь с длинным именем',createdAt:new Date().toISOString()}]}}
 else if(path==='/api/admin/audit')data=[]
 void req.respond({status,contentType:'application/json',body:JSON.stringify(status===200?{ok:true,data}:{ok:false,error:{code:'ADMIN_LOCKED',message:'Подтвердите вход кодом из Telegram.'}})})
})
await page.evaluateOnNewDocument(()=>sessionStorage.setItem('campus-active-page','settings'))
async function button(text:string){await page.waitForFunction(text=>[...document.querySelectorAll('button')].some(b=>(b.textContent?.trim()===text||b.getAttribute('aria-label')===text)&&!b.disabled&&b.getClientRects().length),{},text);await page.evaluate(text=>[...document.querySelectorAll('button')].find(b=>(b.textContent?.trim()===text||b.getAttribute('aria-label')===text)&&!b.disabled&&b.getClientRects().length)!.click(),text)}
try{
 await page.goto('http://127.0.0.1:5174/',{waitUntil:'networkidle0'});await button('Администрирование');await button('Получить код в Telegram')
 await page.waitForSelector('input[autocomplete="one-time-code"]');await page.type('input[autocomplete="one-time-code"]','123456');await button('Войти');await button('Удалить аккаунт test')
 assert.equal(await page.$eval('[role="dialog"] form button:last-child',el=>(el as HTMLButtonElement).disabled),true)
 await page.type('[role="dialog"] form input','test');await button('Удалить навсегда');await page.waitForFunction(()=>document.querySelector('[role="dialog"]')?.textContent?.includes('Аккаунты не найдены'))
 assert.ok(deleted);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 await page.keyboard.press('Escape');assert.equal(await page.$('[role="dialog"]'),null);assert.deepEqual(errors,[])
 console.log('Admin Telegram unlock, account list, explicit deletion confirmation and mobile layout passed using mocked APIs.')
}finally{await browser.close()}
