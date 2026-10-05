import type {Bindings} from '../types'
import {platonusRequest,type PlatonusSession} from './platonus-api'
export async function savePlatonusName(env:Bindings,session:PlatonusSession,revision:string){
 try{
  const {data}=await platonusRequest('/rest/fio/ru',session)
  if(typeof data!=='string')return
  const name=data.trim();if(!name||name.length>250||/[<>\r\n]/.test(name))return
  await env.DB.prepare('INSERT INTO platonus_profile(id,name,captured_at) SELECT 1,?,? WHERE EXISTS(SELECT 1 FROM platonus_connection WHERE revision=? AND session_cipher IS NOT NULL) ON CONFLICT(id) DO UPDATE SET name=excluded.name,captured_at=excluded.captured_at').bind(name,new Date().toISOString(),revision).run()
  try{const reply=await platonusRequest('/rest/api/person/personInfo/ru',session),info=reply.data as Record<string,unknown>;const group=info?.groupName??info?.studyGroupName;if(typeof group==='string'&&group.trim()&&group.length<120)await env.DB.prepare('UPDATE platonus_profile SET group_name=? WHERE id=1 AND EXISTS(SELECT 1 FROM platonus_connection WHERE revision=?)').bind(group.trim(),revision).run()}catch{/* University does not expose group details in every account. */}
  await updatePlatonusDirectory(env)
 }catch{/* Profile availability must not block saved study data. */}
}

/** A small indexed directory for owner-only filtering; never stores a password. */
export async function updatePlatonusDirectory(env:Bindings){
 if(!env.REGISTRY||!env.OWNER_ID||env.OWNER_ID.startsWith('group:'))return
 const row=await env.DB.prepare('SELECT p.name,p.group_name,c.credentials_cipher IS NOT NULL AS connected,c.last_sync_at FROM platonus_connection c LEFT JOIN platonus_profile p ON p.id=c.id WHERE c.id=1').first<{name:string|null;group_name:string|null;connected:number;last_sync_at:string|null}>()
 if(!row)return
 await env.REGISTRY.prepare('INSERT INTO account_profiles(account_id,platonus_name,platonus_group,connected,last_sync_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET platonus_name=excluded.platonus_name,platonus_group=excluded.platonus_group,connected=excluded.connected,last_sync_at=excluded.last_sync_at,updated_at=excluded.updated_at').bind(env.OWNER_ID,row.name,row.group_name,row.connected,row.last_sync_at,Date.now()).run()
}

/** The Platonus login is "Имя_Фамилия"; kept in the owner-only directory so the admin can name students before Platonus returns a full name. */
export async function savePlatonusLogin(env:Bindings,login:string|null|undefined){
 const value=login?.trim().slice(0,150);if(!value||!env.REGISTRY||!env.OWNER_ID||env.OWNER_ID.startsWith('group:'))return
 await env.REGISTRY.prepare('INSERT INTO account_profiles(account_id,platonus_login,updated_at) VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET platonus_login=excluded.platonus_login').bind(env.OWNER_ID,value,Date.now()).run().catch(()=>{/* Directory column arrives with migration 0028; login must never fail because of it. */})
}
