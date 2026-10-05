export function readableWhatsAppError(error:unknown,stage:string){
 const message=error instanceof Error?error.message:typeof error==='string'?error:''
 if(message==='TOKEN_REVOKED')return message
 if(message.trim().length>3)return message.slice(0,300)
 return `Не удалось завершить этап «${stage}». WhatsApp Web вернул внутреннюю ошибку${message?` (${message})`:''}. Повторите подключение с обновлённым коннектором; сохранённая сессия не удаляется.`
}
/** Retry transient navigation aborts without logging out or deleting saved authentication. */
export async function startWhatsApp<T extends {
 initialize():Promise<unknown>;destroy():Promise<unknown>;
 once(event:string,listener:(...args:any[])=>void):unknown;
 removeListener(event:string,listener:(...args:any[])=>void):unknown;
}>(create:()=>T,signal:AbortSignal,onRetry:(attempt:number)=>void){
 for(let attempt=1;attempt<=3;attempt++){
  if(signal.aborted)throw new Error('Подключение отменено')
  const client=create()
  try{
   await new Promise<void>((resolve,reject)=>{
    let timer:ReturnType<typeof setTimeout>;let settled=false
    const done=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);client.removeListener('ready',ready);client.removeListener('auth_failure',failed);client.removeListener('qr',qr);client.removeListener('authenticated',authenticated);client.removeListener('disconnected',disconnected);if(error)reject(error);else resolve()}
    const ready=()=>done(),failed=()=>done(new Error('WhatsApp отклонил вход. Повторите подключение.')),abort=()=>done(new Error('Подключение отменено'))
    const authenticated=()=>{clearTimeout(timer);timer=setTimeout(()=>done(new Error('Вход WhatsApp подтверждён, но чаты не загрузились за 5 минут. Перезапустите коннектор и повторите вход.')),300000)}
    const disconnected=()=>done(new Error('WhatsApp разорвал соединение во время входа. Повторите подключение.'))
    // Give the user time to scan; keep the first navigation itself bounded.
    const qr=()=>{clearTimeout(timer);timer=setTimeout(()=>done(new Error('Время ожидания QR-входа истекло. Нажмите «Показать QR» ещё раз.')),10*60*1000)}
    timer=setTimeout(()=>done(new Error('WhatsApp Web не загрузился за 90 секунд. Проверьте доступ к web.whatsapp.com и повторите подключение.')),90000)
    client.once('authenticated',authenticated);client.once('disconnected',disconnected);client.once('ready',ready);client.once('auth_failure',failed);client.once('qr',qr);signal.addEventListener('abort',abort,{once:true})
    void client.initialize().catch(error=>done(new Error(readableWhatsAppError(error,'загрузка WhatsApp'))))
   })
   return client
  }catch(error){
   await client.destroy().catch(()=>{})
   if(signal.aborted)throw error
   if(!(error instanceof Error)||!error.message.includes('net::ERR_ABORTED'))throw error
   if(attempt===3)throw new Error('WhatsApp Web прервал загрузку (ERR_ABORTED) после 3 попыток. Проверьте, открывается ли https://web.whatsapp.com/ в обычном браузере. Если доступен — обновите коннектор и повторите вход; если нет — проверьте сеть или VPN.')
   onRetry(attempt+1)
  }
 }
 throw new Error('Не удалось запустить WhatsApp')
}
