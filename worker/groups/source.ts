import type {Bindings} from '../types'
import type {PlatonusSnapshot} from '../../bridge/platonus-parser'
export function sharedSnapshot(snapshot:PlatonusSnapshot):PlatonusSnapshot{return {capturedAt:snapshot.capturedAt,semesterStart:snapshot.semesterStart,semesterEnd:snapshot.semesterEnd,weeks:snapshot.weeks,lessons:snapshot.lessons,grades:{tables:[],links:[],error:null},umkd:{tables:[],links:[],error:null}}}
export async function publishGroupSchedule(env:Bindings,accountId:string,snapshot:PlatonusSnapshot){
 if(!env.REGISTRY)return
 const sources=(await env.REGISTRY.prepare('SELECT s.group_id,s.scope FROM group_sources s JOIN group_members m ON m.account_id=s.account_id AND m.group_id=s.group_id WHERE s.account_id=? AND (m.role IN (\'owner\',\'head\') OR (m.role=\'subhead\' AND m.subgroup_id=s.scope))').bind(accountId).all<{group_id:string;scope:string}>()).results
 for(const source of sources){
  const owner=`group:${source.group_id}:${source.scope}`
  const response=await env.WORKSPACES.get(env.WORKSPACES.idFromName(owner)).fetch('https://workspace/internal/schedule-snapshot',{method:'POST',headers:{'x-campus-owner':owner,'content-type':'application/json'},body:JSON.stringify(sharedSnapshot(snapshot))})
  if(!response.ok)continue
  const canonical=JSON.stringify(snapshot.lessons.map(({weekNumber,...lesson})=>({...lesson,parity:weekNumber%2})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical)));const hash=Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('')
  await env.REGISTRY.prepare('INSERT INTO group_schedule_notices(group_id,scope,fingerprint,changed) VALUES(?,?,?,1) ON CONFLICT(group_id,scope) DO UPDATE SET changed=CASE WHEN fingerprint<>excluded.fingerprint THEN 1 ELSE changed END,fingerprint=excluded.fingerprint').bind(source.group_id,source.scope,hash).run()
 }
}
