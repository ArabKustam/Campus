export type JournalOptions = {years:{id:number;label:string}[];terms:{id:number;label:string}[];defaultYear:number;defaultTerm:number;error?:string}
export type JournalMark = {date:string;mark:string;type:string}
export type JournalSubject = {id:number;name:string;teacher:string;score:string;finalScore:string;exams:{name:string;mark:string;typeId:number|null}[];marks?:JournalMark[];marksError?:string}
export type Journal = {year:number;term:number;capturedAt:string;subjects:JournalSubject[];error?:string}
