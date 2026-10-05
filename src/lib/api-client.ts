import {t} from './language'
let groupsEnabled=false
export function setCampusGroupAccess(enabled:boolean){groupsEnabled=enabled;if(!enabled){campusScope='personal';campusOverlay=false}}
export function scopedAssetUrl(path:string){const url=new URL(path,window.location.origin);if(groupsEnabled&&campusScope!=='personal')url.searchParams.set('campus_scope',campusScope);return url.pathname+url.search}
export let campusOverlay=false
export function setCampusOverlay(value:boolean){campusOverlay=groupsEnabled&&value}
export let campusScope = 'personal'
export function setCampusScope(value:string){campusScope=groupsEnabled?value:'personal'}
export type ApiErrorDetails = Array<{ path: string; message: string }> | Record<string, unknown> | undefined

type SuccessEnvelope<T> = { ok: true; data: T }
type ErrorEnvelope = { ok: false; error: { code: string; message: string; details?: ApiErrorDetails } }

export class ApiClientError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: ApiErrorDetails

  constructor(status: number, error: ErrorEnvelope['error']) {
    super(t(error.message))
    this.name = 'ApiClientError'
    this.code = error.code
    this.status = status
    this.details = error.details
  }
}

export async function requestApi<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  if(campusOverlay)headers.set('x-campus-personal-overlay','1')
  if(!groupsEnabled){headers.set('x-campus-scope','personal');headers.delete('x-campus-personal-overlay')}else if(!headers.has('x-campus-scope'))headers.set('x-campus-scope',campusScope)
  headers.set('x-campus-request', '1')
  if (typeof init.body === 'string' && !headers.has('content-type')) headers.set('content-type', 'application/json')

  let response: Response
  try { response = await fetch(url, { ...init, headers }) } catch { throw new ApiClientError(0, { code: 'NETWORK_UNAVAILABLE', message: navigator.onLine ? 'Нет связи с Campus. Проверьте соединение и попробуйте ещё раз. Сохранённые данные не потеряны.' : 'Вы не в сети. Подключитесь к интернету и повторите обновление.' }) }
  let payload: SuccessEnvelope<T> | ErrorEnvelope | null = null
  try {
    payload = await response.json() as SuccessEnvelope<T> | ErrorEnvelope
  } catch {
    throw new ApiClientError(response.status, { code: 'INVALID_RESPONSE', message: 'Сервер Campus временно недоступен. Попробуйте позже.' })
  }

  if (!payload || typeof payload !== 'object' || typeof payload.ok !== 'boolean' || (payload.ok ? !('data' in payload) : !payload.error || typeof payload.error.message !== 'string')) {
    throw new ApiClientError(response.status, { code: 'INVALID_RESPONSE', message: 'Не удалось прочитать ответ сервера. Попробуйте обновить страницу.' })
  }

  if (!response.ok || !payload.ok) {
    if (response.status === 401 && !url.startsWith('/api/auth/')) window.dispatchEvent(new Event('campus-auth-expired'))
    const error = !payload.ok ? payload.error : { code: 'HTTP_ERROR', message: `Ошибка HTTP ${response.status}` }
    throw new ApiClientError(response.status, error)
  }
  return payload.data
}

/** Загрузка файла с прогрессом (fetch не сообщает о ходе отправки). Заголовки — как у requestApi. */
export function uploadWithProgress<T>(url:string,body:FormData,onProgress?:(share:number)=>void):Promise<T>{
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();xhr.open('POST',url);xhr.setRequestHeader('accept','application/json');xhr.setRequestHeader('x-campus-request','1')
  if(!groupsEnabled)xhr.setRequestHeader('x-campus-scope','personal');else{xhr.setRequestHeader('x-campus-scope',campusScope);if(campusOverlay)xhr.setRequestHeader('x-campus-personal-overlay','1')}
  xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress?.(event.loaded/event.total)}
  xhr.onerror=()=>reject(new ApiClientError(0,{code:'NETWORK_UNAVAILABLE',message:'Нет связи с Campus. Проверьте соединение и попробуйте ещё раз. Сохранённые данные не потеряны.'}))
  xhr.onload=()=>{let payload:SuccessEnvelope<T>|ErrorEnvelope|null=null;try{payload=JSON.parse(xhr.responseText)}catch{/* ниже */}
   if(!payload||typeof payload!=='object')return reject(new ApiClientError(xhr.status,{code:'INVALID_RESPONSE',message:xhr.status===413?'Максимальный размер файла — 20 МБ':'Сервер Campus временно недоступен. Попробуйте позже.'}))
   if(xhr.status>=400||!payload.ok){if(xhr.status===401)window.dispatchEvent(new Event('campus-auth-expired'));return reject(new ApiClientError(xhr.status,!payload.ok?payload.error:{code:'HTTP_ERROR',message:`Ошибка HTTP ${xhr.status}`}))}
   resolve(payload.data)}
  xhr.send(body)
 })
}
