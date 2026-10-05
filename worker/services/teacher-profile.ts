const origin='https://person.kstu.kz'
export function allowedProfileUrl(value:string){try{const url=new URL(value,origin);if(url.hostname!=='person.kstu.kz'||!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port)return null;url.protocol='https:';return url.href}catch{return null}}
const decode=(s:string)=>s.replace(/&(?:nbsp|amp|quot|lt|gt);/g,m=>({'&nbsp;':' ','&amp;':'&','&quot;':'"','&lt;':'<','&gt;':'>'}[m]!)).replace(/&#(\d+);/g,(_,n)=>Number(n)<=0x10ffff?String.fromCodePoint(Number(n)):'')
export async function fetchProfileHtml(url:string){
 let current=allowedProfileUrl(url);if(!current)throw new Error('Недопустимый адрес профиля')
 for(let i=0;i<3;i++){
   const response=await fetch(current,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{accept:'text/html'}})
   if(response.status>=300&&response.status<400){current=allowedProfileUrl(new URL(response.headers.get('location')||'',current).href);if(!current)throw new Error('Недопустимое перенаправление');continue}
   if(!response.ok)throw new Error('Сайт университета временно недоступен')
   const reader=response.body!.getReader();let size=0,html='';const decoder=new TextDecoder()
   try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>2*1024*1024)throw new Error('Слишком большой ответ сайта');html+=decoder.decode(chunk.value,{stream:true})}return html+decoder.decode()}finally{await reader.cancel().catch(()=>{})}
 }
 throw new Error('Не удалось открыть страницу университета')
}
export async function parseTeacherCandidates(html:string,name:string){
 const candidates:{name:string;url:string}[]=[];let current:{name:string;url:string}|null=null
 await new HTMLRewriter().on('.entry-title a',{element(e){const url=allowedProfileUrl(e.getAttribute('href')||'');current=url?{name:'',url}:null;if(current)candidates.push(current)},text(t){if(current)current.name+=t.text}}).transform(new Response(html)).text()
 const parts=name.normalize('NFC').toLocaleLowerCase().replace(/ё/g,'е').match(/\p{L}+/gu)??[],surname=parts[0]
 return candidates.map(c=>({...c,name:decode(c.name).trim()})).filter(c=>{const full=c.name.normalize('NFC').toLocaleLowerCase().replace(/ё/g,'е').match(/\p{L}+/gu)??[];return surname&&full[0]===surname&&parts.slice(1).every((part,i)=>part.length===1?full[i+1]?.startsWith(part):full[i+1]===part)}).slice(0,10)
}
export async function parseTeacherProfile(html:string,url:string){
 let name='',text='',photo:string|null=null
 await new HTMLRewriter().on('h1.entry-title',{text(t){name+=t.text}}).on('.entry-content',{text(t){text+=t.text}}).on('.entry-content p, .entry-content tr, .entry-content h2, .entry-content h3',{element(e){e.onEndTag(()=>{text+='\n'})}}).on('.entry-content img',{element(e){if(!photo){const src=allowedProfileUrl(e.getAttribute('src')||'');if(src&&/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(src))photo=src}}}).transform(new Response(html)).text()
 return {name:decode(name).trim(),text:decode(text).replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n\n').trim().slice(0,10000),photo,url,fetchedAt:new Date().toISOString()}
}
