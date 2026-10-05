import {env} from 'cloudflare:workers'
import {expect,it,vi} from 'vitest'
import {savePlatonusName} from '../services/platonus-profile'
it('stores only a profile name, preserves Kazakh letters, and rejects stale connections and HTML',async()=>{
 await env.DB.prepare("UPDATE platonus_connection SET revision='profile-test',session_cipher='test' WHERE id=1").run()
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('Әлім Нұрланұлы',{headers:{'content-type':'text/plain'}}))
 try{
  await savePlatonusName(env,{token:'test'},'profile-test')
  expect((await env.DB.prepare('SELECT name FROM platonus_profile WHERE id=1').first<any>())?.name).toBe('Әлім Нұрланұлы')
  fetcher.mockResolvedValue(Response.json('Another person'));await savePlatonusName(env,{token:'test'},'old-revision')
  expect((await env.DB.prepare('SELECT name FROM platonus_profile WHERE id=1').first<any>())?.name).toBe('Әлім Нұрланұлы')
  fetcher.mockResolvedValue(new Response('<html>Log in</html>',{headers:{'content-type':'text/html'}}));await savePlatonusName(env,{token:'test'},'profile-test')
  expect((await env.DB.prepare('SELECT name FROM platonus_profile WHERE id=1').first<any>())?.name).toBe('Әлім Нұрланұлы')
 }finally{fetcher.mockRestore()}
})
