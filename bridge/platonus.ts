import puppeteer, { type Browser, type Page } from 'puppeteer'
import { parseLesson, semesterDates, type PlatonusSnapshot, type StudySection } from './platonus-parser.js'
const origin='https://platonus.kstu.kz'
/** Dedicated local browser profile. Neither cookies nor credentials are sent to Campus. */
export class PlatonusSession {
 browser?:Browser
 page?:Page
 status='opening'
 error:string|null=null
 phase='Открывается окно Platonus'
 running=false
 stopped=false
 constructor(readonly directory:string,readonly upload:(snapshot:PlatonusSnapshot)=>Promise<unknown>){}
 state(){return {status:this.status,error:this.error,phase:this.phase,version:3}}
 async open(){
  try{
   this.browser=await puppeteer.launch({headless:false,userDataDir:this.directory,...(process.env.CAMPUS_CHROME_PATH?{executablePath:process.env.CAMPUS_CHROME_PATH}:{})})
   this.browser.on('disconnected',()=>{this.status='disconnected';this.phase='Окно Platonus закрыто'})
   this.page=await this.browser.newPage()
   await this.page.goto(origin,{waitUntil:'domcontentloaded',timeout:45000})
   this.status='ready';this.phase='Войдите в Platonus в открывшемся окне, затем нажмите «Получить данные» в Campus.'
  }catch{this.status='error';this.error='Не удалось открыть Platonus. Проверьте доступность сайта университета и повторите подключение.'}
 }
 async sync(){
  if(this.running)throw new Error('Получение данных уже выполняется')
  if(!this.page||this.page.isClosed())throw new Error('Сначала откройте окно входа Platonus')
  this.running=true;this.error=null;this.status='syncing';this.phase='Чтение расписания двух недель'
  void this.collect().then(async snapshot=>{if(this.stopped)return;await this.upload(snapshot);this.status='ready';this.phase='Данные получены. Проверьте изменения расписания перед импортом.'}).catch(e=>{this.status='error';this.error=e instanceof Error?e.message:'Не удалось получить данные'}).finally(()=>{this.running=false})
 }
 async go(path:string){
  const p=this.page!
  try{await p.goto(`${origin}${path}`,{waitUntil:'networkidle2',timeout:45000})}catch{throw new Error('Platonus не ответил за 45 секунд. Данные Campus сохранены. Попробуйте позже.')}
  if(new URL(p.url()).origin!==origin||await p.$('#login_input'))throw new Error('Войдите в аккаунт в окне Platonus, затем повторите получение данных.')
  return p
 }
 async collect():Promise<PlatonusSnapshot>{
  const p=await this.go('/v7/#/schedule/studentView')
  await p.waitForSelector('#selectWeek',{timeout:20000}).catch(()=>{throw new Error('Не удалось открыть расписание. Проверьте вход в Platonus и выбранный семестр.')})
  const options=await p.$eval('#selectWeek',el=>({selected:Number((el as HTMLSelectElement).value),weeks:[...(el as HTMLSelectElement).options].map(v=>Number(v.value)).filter(v=>v>0)}))
  const first=options.weeks.includes(options.selected+1)?options.selected:options.selected-1
  if(!options.weeks.includes(first)||!options.weeks.includes(first+1))throw new Error('В Platonus недоступны две соседние недели.')
  const periods=semesterDates(await p.$eval('body',el=>el.innerText))
  const lessons:PlatonusSnapshot['lessons']=[]
  for(const weekNumber of [first,first+1]){
   this.phase=`Чтение расписания: неделя ${weekNumber}`
   // Native select emits change, Angular updates the rendered schedule.
   await p.select('#selectWeek',String(weekNumber))
   await p.waitForNetworkIdle({idleTime:1200,timeout:25000})
   await p.waitForSelector('#week .card-body h5.card-title',{timeout:15000})
   const days=await p.$$eval('#week .card-body',cards=>cards.map(card=>({day:card.querySelector('h5.card-title')?.textContent?.trim(),rows:[...card.querySelectorAll('table tbody tr')].map(tr=>({time:tr.querySelector('td')?.textContent?.trim()??'',lessons:[...tr.querySelectorAll('app-schedule-view-lesson-block')].map(l=>l.textContent?.trim()??'').filter(Boolean)}))})))
   const names=['понедельник','вторник','среда','четверг','пятница','суббота','воскресенье']
   if(days.length<5)throw new Error('Расписание загрузилось не полностью. Импорт остановлен.')
   for(const day of days){const weekday=names.indexOf((day.day??'').toLowerCase())+1;if(!weekday)throw new Error('Не распознан день недели. Переключите язык Platonus на русский.');for(const [index,row] of day.rows.entries())for(const text of row.lessons)lessons.push(parseLesson(text,row.time,weekday,index+1,weekNumber))}
  }
  this.phase='Чтение журнала оценок'
  const grades=await this.section('/student_register','Оценки')
  this.phase='Чтение УМКД'
  const umkd=await this.section('/v7/#/umkd/main','УМКД')
  return {capturedAt:new Date().toISOString(),...periods,weeks:[first,first+1],lessons,grades,umkd}
 }
 async section(path:string,title:string):Promise<StudySection>{
  try{
   const p=await this.go(path)
   // Preserve the original headings and cell text; never turn an absent score into zero.
   await p.waitForSelector('table',{timeout:12000})
   const tables=await p.$$eval('table',tables=>tables.filter(t=>t.getBoundingClientRect().height>0).map(t=>({title:t.querySelector('caption')?.textContent?.trim()??'',headers:[...(t.querySelector('thead tr:last-child')?.querySelectorAll('th,td')??[])].map(c=>c.textContent?.trim()??''),rows:[...t.querySelectorAll('tbody tr')].map(r=>[...r.children].filter(c=>c.tagName==='TD'||c.tagName==='TH').map(c=>c.textContent?.trim()??''))})).filter(t=>t.rows.length>0))
   if(!tables.length||!tables.some(t=>(title==='Оценки'?/оцен|балл|рейтинг|дисциплин|grade|баға|пән/iu:/умкд|дисциплин|материал|пән|файл|наименование/iu).test([...t.headers,...t.rows.slice(0,2).flat()].join(' '))))throw new Error('Нет распознанной учебной таблицы')
   // No harvesting of navigation, hidden profile data or URLs carrying authentication parameters.
   const links=await p.$$eval('table a[href]',anchors=>anchors.map(a=>({title:a.textContent?.trim()??'',url:(a as HTMLAnchorElement).href})).filter(a=>{try{const u=new URL(a.url);return Boolean(a.title)&&u.origin==='https://platonus.kstu.kz'&&!u.username&&!u.password&&!/token|password|session|auth/i.test(u.search)}catch{return false}}))
   return {tables:tables.map(t=>({...t,title:t.title||title})),links,error:null}
  }catch{return {tables:[],links:[],error:`${title}: таблица недоступна или её формат не распознан. Откройте раздел в Platonus. Сохранённые данные не заменены.`}}
 }
 async close(){this.stopped=true;await this.browser?.close();this.status='disconnected'}
}
