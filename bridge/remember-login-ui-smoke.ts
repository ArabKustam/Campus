import puppeteer from 'puppeteer'
import assert from 'node:assert/strict'
const browser=await puppeteer.launch({headless:true}),page=await browser.newPage()
let authenticated=false;const logins:any[]=[],errors:string[]=[]
page.on('pageerror',e=>errors.push(String(e)))
await page.setViewport({width:390,height:844});await page.setRequestInterception(true)
page.on('request',req=>{
 const path=new URL(req.url()).pathname;if(!path.startsWith('/api/')){void req.continue();return}
 if(path==='/api/auth/me'&&!authenticated){void req.respond({status:401,contentType:'application/json',body:JSON.stringify({ok:false,error:{code:'AUTH_REQUIRED',message:'Войдите'}})});return}
 let data:unknown={}
 if(path==='/api/auth/me')data={id:'demo',login:'demo',displayName:'demo'}
 if(path==='/api/onboarding')data={onboarding:false}
 if(path==='/api/schedule')data={slots:[],overrides:[]}
 if(path==='/api/platonus/connection')data={status:'disconnected',credentialsSaved:false}
 if(path==='/api/platonus/login'){logins.push(JSON.parse(req.postData()!));data={status:'disconnected',credentialsSaved:false}}
 if(path==='/api/notifications')data={items:[],unread:0}
 void req.respond({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data})})
})
async function button(text:string){await page.waitForFunction(text=>[...document.querySelectorAll('button')].some(b=>b.textContent?.trim()===text&&!b.disabled&&b.getClientRects().length),{},text);await page.evaluate(text=>[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()===text&&!b.disabled&&b.getClientRects().length)!.click(),text)}
try{
 await page.goto('http://127.0.0.1:5174/',{waitUntil:'networkidle0'});await button('Создать аккаунт')
 assert.deepEqual(await page.$$eval('form input',els=>els.map(e=>e.getAttribute('name'))),['login','password'])
 authenticated=true;await page.evaluate(()=>{sessionStorage.setItem('campus-active-page','settings');sessionStorage.setItem('campus-settings-section','platonus')});await page.reload({waitUntil:'networkidle0'})
 await page.waitForSelector('input[type="password"]');assert.equal(await page.$eval('input[type="checkbox"]',e=>(e as HTMLInputElement).checked),false)
 async function fill(){await page.type('input[autocomplete="username"]','student');await page.type('input[type="password"]','test-only-password')}
 await fill();await button('Подключить Platonus');await page.waitForFunction(()=>!(document.querySelector('input[type="password"]') as HTMLInputElement)?.value)
 assert.equal(logins[0].remember,false)
 await page.click('input[type="checkbox"]');await fill();await button('Подключить Platonus');await page.waitForFunction(()=>!(document.querySelector('input[type="password"]') as HTMLInputElement)?.value)
 assert.equal(logins[1].remember,true);assert.deepEqual(errors,[])
 await page.screenshot({path:'qa-artifacts/platonus-remember-mobile.png'})
 console.log('Registration has only login/password; remember defaults off and explicit checkbox choice is sent correctly.')
}finally{await browser.close()}
