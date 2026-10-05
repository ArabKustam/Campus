// Creates a local demo account with a realistic week of classes, tasks and materials.
// Runs only against the local dev server (`npm run dev` in the project root).
import {execSync} from 'node:child_process'
import {randomBytes} from 'node:crypto'
import {writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
export const BASE = process.env.CAMPUS_URL ?? 'http://localhost:5173'

const data = {
  ru: {
    name: 'Алия Серикова',
    subjects: [['Дискретная математика', '#2563eb'], ['Базы данных', '#16a34a'], ['Архитектура ЭВМ', '#f59e0b'], ['Английский язык', '#db2777'], ['Алгоритмы и структуры данных', '#7c3aed'], ['Физика', '#0891b2']],
    teachers: ['Ахметова Г. С.', 'Иванов П. А.', 'Касымов Е. Т.', 'Smith J.', 'Нурланова А. Б.', 'Петров В. Н.'],
    types: {L: 'Лекция', P: 'Практика', Lab: 'Лабораторная'},
    buildings: {A: 'Главный корпус', B: 'Корпус Б', C: 'Корпус В'},
    homework: [
      [0, 6, 'Практическая работа №4: графы и деревья', 'Решить задачи 1–8 из методички, оформить в PDF.', 1],
      [1, 1, 'Лабораторная №3: нормализация БД', 'Привести схему «Библиотека» к 3НФ и сдать ER-диаграмму.', 3],
      [4, 3, 'Реализовать сортировку слиянием', 'Python или C++, тесты на 10⁵ элементов.', 4],
      [3, 2, 'Эссе «Моя будущая профессия»', '250–300 слов, загрузить в Platonus.', 6],
      [5, 5, 'Отчёт по лабораторной «Маятник»', null, 8],
    ],
    materials: [[0, 'Конспект лекции 5 — теория графов', 'document', null], [1, 'PostgreSQL: документация', 'link', 'https://www.postgresql.org/docs/'], [4, 'Кормен — «Алгоритмы: построение и анализ»', 'book', null]],
  },
  en: {
    name: 'Aliya Serikova',
    subjects: [['Discrete Mathematics', '#2563eb'], ['Databases', '#16a34a'], ['Computer Architecture', '#f59e0b'], ['English', '#db2777'], ['Algorithms & Data Structures', '#7c3aed'], ['Physics', '#0891b2']],
    teachers: ['Akhmetova G.', 'Ivanov P.', 'Kassymov Y.', 'Smith J.', 'Nurlanova A.', 'Petrov V.'],
    types: {L: 'Lecture', P: 'Practice', Lab: 'Lab'},
    buildings: {A: 'Main building', B: 'Building B', C: 'Building C'},
    homework: [
      [0, 6, 'Practical work #4: graphs and trees', 'Solve problems 1–8 from the workbook, submit as PDF.', 1],
      [1, 1, 'Lab #3: database normalization', 'Bring the “Library” schema to 3NF and submit the ER diagram.', 3],
      [4, 3, 'Implement merge sort', 'Python or C++, tests on 10⁵ elements.', 4],
      [3, 2, 'Essay: My future profession', '250–300 words, upload to Platonus.', 6],
      [5, 5, 'Pendulum lab report', null, 8],
    ],
    materials: [[0, 'Lecture 5 notes — graph theory', 'document', null], [1, 'PostgreSQL documentation', 'link', 'https://www.postgresql.org/docs/'], [4, 'Cormen — Introduction to Algorithms', 'book', null]],
  },
}
const times = [['09:00', '10:45'], ['10:55', '12:40'], ['13:10', '14:55'], ['15:05', '16:50']]
// weekday, pair number, subject index, type, building, room
const slots = [
  [1, 1, 0, 'L', 'A', '304'], [1, 2, 1, 'Lab', 'B', '218'], [1, 3, 3, 'P', 'A', '112'],
  [2, 1, 4, 'L', 'A', '201'], [2, 2, 2, 'P', 'B', '310'],
  [3, 1, 5, 'L', 'C', '105'], [3, 2, 0, 'P', 'A', '304'], [3, 3, 1, 'L', 'B', '401'],
  [4, 2, 4, 'Lab', 'B', '220'], [4, 3, 3, 'P', 'A', '112'],
  [5, 1, 2, 'L', 'A', '201'], [5, 2, 5, 'Lab', 'C', '014'],
]

export function apiFor(page) {
  return (path, method = 'GET', body) => page.evaluate(async (path, method, body) => {
    const r = await fetch(path, {method, headers: {'content-type': 'application/json', 'x-campus-request': '1'}, body: body ? JSON.stringify(body) : undefined})
    const text = await r.text()
    if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${text}`)
    return text ? JSON.parse(text) : null
  }, path, method, body)
}

/** Registers a fresh account. With `fill: false` it stops at the Platonus onboarding screen. */
export async function seed(page, lang = 'ru', {fill = true} = {}) {
  const d = data[lang]
  await page.goto(BASE, {waitUntil: 'networkidle0'})
  const api = apiFor(page)
  const pick = (r) => r?.data ?? r
  // A readable login shows in the sidebar; fall back to a unique one if a previous run left it behind.
  let login = fill ? `aliya.${lang}` : `new.${Date.now()}`
  const password = randomBytes(18).toString('hex')
  const register = () => api('/api/auth/register', 'POST', {login, password, displayName: d.name})
  const user = pick(await register().catch(() => { login = `aliya.${Date.now()}`; return register() }))
  if (!fill) return {login, password, api}
  // Unlock every feature for the demo account (the same table the admin panel writes).
  const sql = join(tmpdir(), 'campus-demo-permissions.sql')
  writeFileSync(sql, `INSERT OR REPLACE INTO account_permissions(account_id,features_json) VALUES('${user.id}','["ai","groups","messengers","tasks"]');`)
  execSync(`npx wrangler d1 execute campus-db --local --file "${sql}"`, {cwd: root, stdio: 'pipe'})
  await api('/api/onboarding', 'POST')
  const subjectIds = [], teacherIds = [], slotIds = []
  for (const [name, color] of d.subjects) subjectIds.push(pick(await api('/api/catalog/subjects', 'POST', {name, shortName: null, color})).id)
  for (const name of d.teachers) teacherIds.push(pick(await api('/api/catalog/teachers', 'POST', {name, email: null})).id)
  for (const [weekday, n, s, type, building, room] of slots) {
    const [startTime, endTime] = times[n - 1]
    slotIds.push(pick(await api('/api/catalog/slots', 'POST', {subjectId: subjectIds[s], teacherId: teacherIds[s], weekday, slotNumber: n, startTime, endTime, weekType: 'both', lessonType: d.types[type], building: d.buildings[building], room})).id)
  }
  const due = (offset) => { const x = new Date(); x.setDate(x.getDate() + offset); return `${x.toISOString().slice(0, 10)}T23:59:00+05:00` }
  for (const [s, slot, title, description, offset] of d.homework)
    await api('/api/homework', 'POST', {subjectId: subjectIds[s], scheduleSlotId: slotIds[slot], title, description, dueAt: due(offset)})
  for (const [s, title, kind, url] of d.materials)
    await api('/api/materials', 'POST', {subjectId: subjectIds[s], title, kind, url})
  return {login, password, api}
}

export const removeAccount = (api, password) => api('/api/auth/account', 'DELETE', {password})
