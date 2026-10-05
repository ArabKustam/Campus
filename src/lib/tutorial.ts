export const tutorialMessages=[
 ['Привет, что ты можешь?','Я помогу с расписанием и заданиями. Укажите предмет, день и номер пары. Например: «Отмени первую пару в среду». Если занятие неясно, я уточню.'],
 ['Отмени первую пару в среду','Первая пара в среду — физика. Отмечаю её отменённой.'],
 ['Добавь в среду третьей парой математику, семинар, кабинет 420','Добавляю математику третьей парой: 13:10–14:55, семинар, кабинет 420.'],
 ['ДЗ по математике: решить задачи 2–5 к среде','Записываю задачи 2–5 к математике на среду.'],
 ['Отмени последние 3 изменения','Отменяю добавление задания, добавление математики и отмену физики. Исходное расписание восстановлено.'],
] as const
// Pure preview state: no schedule IDs, network mutations, or persisted demo actions.
export function tutorialSchedule(step:number,applied:boolean){
 return {cancelled:step>5&&step<8||step===5&&applied||step===8&&!applied,added:step>6&&step<8||step===6&&applied||step===8&&!applied,homework:step===7&&applied||step===8&&!applied}
}
export function tutorialPhase(step:number,elapsed:number,length:number,reduced=false){
 const typingEnd=reduced?500:500+length*22
 const replyAt=typingEnd+900,switchAt=replyAt+1800,applyAt=switchAt+1800
 return {draft:elapsed<typingEnd?(elapsed<500?'':Math.min(length,Math.floor((elapsed-500)/(reduced?1:22)))):0,sent:elapsed>=typingEnd,replied:elapsed>=replyAt,showSchedule:step>=5&&step<=8&&elapsed>=switchAt,applied:elapsed>=applyAt,done:elapsed>=(step>=5&&step<=8?applyAt+1000:replyAt+900)}
}
