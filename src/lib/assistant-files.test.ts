import {describe,expect,it} from 'vitest'
import {acceptAssistantFiles,formatBytes,ASSISTANT_FILE_BYTES} from './assistant-files'
const file=(name:string,type:string,size=10)=>new File([new Uint8Array(size)],name,{type})
describe('assistant file picking',()=>{
 it('accepts photos and documents, including phones sending no MIME type',()=>{
  const {files,problem}=acceptAssistantFiles([],[file('a.jpg','image/jpeg'),file('b.PDF',''),file('c.docx','')])
  expect(files.map(f=>f.name)).toEqual(['a.jpg','b.PDF','c.docx']);expect(problem).toBeNull()
 })
 it('reports unsupported, empty, oversized and excess files',()=>{
  expect(acceptAssistantFiles([],[file('x.exe','application/x-msdownload')]).problem).toEqual({kind:'type',name:'x.exe'})
  expect(acceptAssistantFiles([],[file('e.png','image/png',0)]).problem).toEqual({kind:'empty',name:'e.png'})
  const big={name:'big.pdf',type:'application/pdf',size:ASSISTANT_FILE_BYTES+1,lastModified:0} as File
  expect(acceptAssistantFiles([],[big]).problem).toEqual({kind:'size',name:'big.pdf'})
  const many=acceptAssistantFiles([],Array.from({length:7},(_,i)=>file(`p${i}.png`,'image/png')))
  expect(many.files).toHaveLength(5);expect(many.problem).toEqual({kind:'count'})
 })
 it('formats sizes compactly',()=>{expect(formatBytes(2048)).toBe('2 КБ');expect(formatBytes(3*1024*1024)).toBe('3 МБ')})
})
