/** Minimal, XSS-free markdown for assistant replies: paragraphs, bullet/numbered lists, **bold**, `code`. */
export type Inline={text:string;bold?:boolean;code?:boolean}
export type Block={kind:'p';lines:Inline[][]}|{kind:'ul'|'ol';items:Inline[][]}
export function parseInline(text:string):Inline[]{
 const out:Inline[]=[]
 for(const part of text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)){if(!part)continue
  if(/^\*\*[^*]+\*\*$/.test(part))out.push({text:part.slice(2,-2),bold:true})
  else if(/^`[^`]+`$/.test(part))out.push({text:part.slice(1,-1),code:true})
  else out.push({text:part.replace(/^#{1,6}\s+/,'')})}
 return out
}
export function parseChatMarkdown(source:string):Block[]{
 const blocks:Block[]=[]
 for(const raw of source.replace(/\r/g,'').split('\n')){
  const line=raw.trimEnd(),bullet=line.match(/^\s*[-*•]\s+(.*)$/),numbered=line.match(/^\s*\d+[.)]\s+(.*)$/),last=blocks.at(-1)
  if(!line.trim()){if(last)blocks.push({kind:'p',lines:[]});continue}
  if(bullet||numbered){const kind=bullet?'ul':'ol',item=parseInline((bullet??numbered)![1]);if(last?.kind===kind)last.items.push(item);else blocks.push({kind,items:[item]});continue}
  const heading=/^#{1,6}\s+/.test(line),inline=parseInline(line)
  if(heading)inline.forEach(i=>i.bold=true)
  if(last?.kind==='p')last.lines.push(inline);else blocks.push({kind:'p',lines:[inline]})
 }
 return blocks.filter(b=>b.kind!=='p'||b.lines.length)
}
