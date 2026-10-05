import {extractAiResponse} from '../services/processing'
import {workersAiJsonSchema,aiBatchSchema} from '../schemas/ai-action'
export default {async fetch(_request:Request,env:{AI:Ai}){
 const schema=workersAiJsonSchema
 const result=await env.AI.run('@cf/google/gemma-4-26b-a4b-it' as keyof AiModels,{messages:[{role:'system',content:'Extract a university planner action. Only JSON. Say IGNORE for greetings, ADD_HOMEWORK for explicit homework. Use only the IDs supplied. Unspecified dates, time, room and URL must be null. Reason in Russian.'},{role:'user',content:'Message M1: дз по физике: решить задачи 1-3. Subject id: physics. No date specified.'}],max_tokens:4096,chat_template_kwargs:{enable_thinking:false},response_format:{type:'json_schema',json_schema:{name:'planner_actions',schema}}} as never)
 return Response.json({parsed:aiBatchSchema.parse(extractAiResponse(result)),keys:Object.keys(result as object)})
}}
