import {describe,expect,it} from 'vitest'
import {parseChatMarkdown,parseInline} from './chat-markdown'
describe('chat markdown',()=>{
 it('parses bold and code without HTML',()=>{
  expect(parseInline('**Завтра** две пары, `ауд. 352` <b>x</b>')).toEqual([{text:'Завтра',bold:true},{text:' две пары, '},{text:'ауд. 352',code:true},{text:' <b>x</b>'}])
 })
 it('groups lists and paragraphs',()=>{
  const blocks=parseChatMarkdown('Итог:\n- Экономика\n* Философия\n\n1. Первое\n2) Второе\nТекст\n### Заголовок')
  expect(blocks.map(b=>b.kind)).toEqual(['p','ul','ol','p'])
  expect(blocks[1]).toEqual({kind:'ul',items:[[{text:'Экономика'}],[{text:'Философия'}]]})
  expect(blocks[3]).toEqual({kind:'p',lines:[[{text:'Текст'}],[{text:'Заголовок',bold:true}]]})
 })
 it('ignores empty input',()=>{expect(parseChatMarkdown('\n\n')).toEqual([])})
})
