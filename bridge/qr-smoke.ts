const origin='https://campus-planner.mymemory9.workers.dev';let cookie='',localToken=''
async function cloud(path:string,body?:unknown,method=body===undefined?'GET':'POST'){
 const r=await fetch(origin+'/api'+path,{method,headers:{origin,'x-campus-request':'1','content-type':'application/json',cookie},...(body===undefined?{}:{body:JSON.stringify(body)})});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie')!.split(';')[0];const v=await r.json() as any;if(!r.ok)throw new Error(v.error?.message);return v.data
}
async function local(path:string,body?:unknown){const r=await fetch('http://127.0.0.1:3987'+path,{method:body===undefined?'GET':'POST',headers:{origin,'x-campus-local':'1','content-type':'application/json',...(localToken?{authorization:`Bearer ${localToken}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const v=await r.json() as any;if(!r.ok)throw new Error(v.error);return v}
try{
 if(!process.env.CAMPUS_QA_LOGIN||!process.env.CAMPUS_QA_PASSWORD)throw new Error('Set CAMPUS_QA_LOGIN and CAMPUS_QA_PASSWORD')
 await cloud('/auth/login',{login:process.env.CAMPUS_QA_LOGIN,password:process.env.CAMPUS_QA_PASSWORD})
 const {token}=await cloud('/auth/connector-token',{})
 await cloud('/personal/whatsapp/connect',{})
 const linked=await local('/link',{token,provider:'whatsapp'});localToken=linked.localToken
 for(let i=0;i<30;i++){
  await new Promise(r=>setTimeout(r,1500));const state=await local('/state')
  if(state.qr){console.log(JSON.stringify({qrReceived:true,status:state.status,personalLogin:false}));break}
  if(state.status==='error')throw new Error(state.error)
  if(i===29)throw new Error('QR_TIMEOUT')
 }
}finally{
 if(cookie)await cloud('/personal/whatsapp',{},'DELETE').catch(()=>{})
 if(localToken)await local('/disconnect',{}).catch(()=>{})
}
