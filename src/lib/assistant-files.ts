export const ASSISTANT_FILE_LIMIT=5
export const ASSISTANT_FILE_BYTES=20*1024*1024
export const ASSISTANT_TOTAL_BYTES=50*1024*1024
export const ASSISTANT_ACCEPT='image/*,.heic,.heif,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt'
const EXTENSIONS=new Set(['jpg','jpeg','png','webp','gif','heic','heif','pdf','doc','docx','ppt','pptx','xls','xlsx','txt'])
const TYPES=/^(?:image\/(?:jpeg|png|webp|gif|heic|heif)|application\/pdf|text\/plain|application\/(?:msword|vnd\.ms-powerpoint|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.(?:wordprocessingml\.document|presentationml\.presentation|spreadsheetml\.sheet)))$/
export type FileProblem={kind:'type'|'size'|'empty'|'count'|'total';name?:string}
/** Mirrors the server rules so the user learns about a bad file before uploading it. */
export function acceptAssistantFiles(current:File[],incoming:File[]):{files:File[];problem:FileProblem|null}{
 const files=[...current];let problem:FileProblem|null=null
 for(const file of incoming){
  const ext=file.name.split('.').pop()?.toLowerCase()??''
  if(!TYPES.test(file.type)&&!EXTENSIONS.has(ext)){problem??={kind:'type',name:file.name};continue}
  if(file.size>ASSISTANT_FILE_BYTES){problem??={kind:'size',name:file.name};continue}
  if(!file.size){problem??={kind:'empty',name:file.name};continue}
  if(files.length>=ASSISTANT_FILE_LIMIT){problem??={kind:'count'};break}
  if(files.reduce((sum,f)=>sum+f.size,file.size)>ASSISTANT_TOTAL_BYTES){problem??={kind:'total'};continue}
  if(!files.some(f=>f.name===file.name&&f.size===file.size&&f.lastModified===file.lastModified))files.push(file)
 }
 return {files,problem}
}
export const formatBytes=(bytes:number)=>bytes<1024*1024?`${Math.max(1,Math.round(bytes/1024))} КБ`:`${(bytes/1024/1024).toFixed(1).replace('.0','')} МБ`
