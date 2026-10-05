import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError, requestApi } from './api-client'

afterEach(() => vi.unstubAllGlobals())

describe('requestApi', () => {
  it('unwraps a typed success envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { id: 'lesson-1' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })))

    await expect(requestApi<{ id: string }>('/api/lessons/lesson-1')).resolves.toEqual({ id: 'lesson-1' })
  })

  it('throws the backend error code and validation details', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Некорректные данные', details: [{ path: 'date', message: 'Ожидается дата' }] },
    }), { status: 400, headers: { 'content-type': 'application/json' } })))

    const error = await requestApi('/api/schedule/day').catch((reason) => reason)
    expect(error).toBeInstanceOf(ApiClientError)
    expect(error).toMatchObject({ code: 'VALIDATION_ERROR', status: 400, details: [{ path: 'date' }] })
  })
})
it('uses only personal data while groups are hidden, even with stale group selection',async()=>{
 const {setCampusScope,setCampusOverlay}=await import('./api-client')
 setCampusScope('common');setCampusOverlay(true)
 const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>{const headers=new Headers(init?.headers);expect(headers.get('x-campus-scope')).toBe('personal');expect(headers.has('x-campus-personal-overlay')).toBe(false);return Response.json({ok:true,data:[]})})
 vi.stubGlobal('fetch',fetcher)
 await requestApi('/api/assistant',{headers:{'x-campus-scope':'all','x-campus-personal-overlay':'1'}})
 expect(fetcher).toHaveBeenCalledOnce()
})
