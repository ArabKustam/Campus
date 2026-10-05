import type {Bindings} from './types'
export const FEATURES=['ai','groups','messengers','tasks'] as const
export type Feature=typeof FEATURES[number]
export async function accountFeatures(env:Bindings,id:string):Promise<Feature[]> {
 if(id===env.ADMIN_ACCOUNT_ID)return [...FEATURES]
 const row=await (env.REGISTRY??env.DB).prepare('SELECT features_json FROM account_permissions WHERE account_id=?').bind(id).first<{features_json:string}>()
 return row?JSON.parse(row.features_json).filter((f:Feature)=>FEATURES.includes(f)):[]
}
export function requiredFeature(path:string):Feature|undefined {
 if(/^\/api\/assistant(?:\/|$)/.test(path))return 'ai'
 if(/^\/api\/groups(?:\/|$)/.test(path))return 'groups'
 if(/^\/api\/(?:personal|people|messages|processing|bridges|connector|integrations)(?:\/|$)/.test(path)||path==='/api/auth/connector-token')return 'messengers'
 if(/^\/api\/(?:homework|materials)(?:\/|$)/.test(path))return 'tasks'
}
