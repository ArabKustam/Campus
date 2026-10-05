// Demo responses for screens that read live Platonus data or call Workers AI.
// The screenshot browser serves them in place of the real API, so the real UI renders
// without a university account or a Cloudflare login. Everything here is sample data.
const umkdUrl = (id) => `https://platonus.kstu.kz/v7/#/umkd/studentUmkd/${id}`

const ru = {
  grades: [
    ['Дискретная математика', 'Ахметова Г. С.', '88', [['РК 1', '91'], ['РК 2', '85'], ['Рейтинг', '88'], ['Экзамен', ''], ['Итоговая', '']], [['2026-09-08', '90', 'Практика'], ['2026-09-15', '85', 'Практика'], ['2026-09-22', '95', 'СРС'], ['2026-09-29', '82', 'Практика'], ['2026-10-01', '91', 'РК 1']]],
    ['Базы данных', 'Иванов П. А.', '94', [['РК 1', '96'], ['РК 2', '92'], ['Рейтинг', '94'], ['Экзамен', ''], ['Итоговая', '']], [['2026-09-07', '100', 'Лабораторная'], ['2026-09-14', '95', 'Лабораторная'], ['2026-09-21', '90', 'Лабораторная'], ['2026-09-30', '96', 'РК 1']]],
    ['Архитектура ЭВМ', 'Касымов Е. Т.', '71', [['РК 1', '68'], ['РК 2', '74'], ['Рейтинг', '71'], ['Экзамен', ''], ['Итоговая', '']], [['2026-09-09', '70', 'Практика'], ['2026-09-23', '65', 'СРС'], ['2026-10-02', '68', 'РК 1']]],
    ['Английский язык', 'Smith J.', '97', [['РК 1', '98'], ['РК 2', '96'], ['Рейтинг', '97'], ['Экзамен', ''], ['Итоговая', '']], [['2026-09-10', '100', 'Практика'], ['2026-09-24', '95', 'Эссе']]],
  ],
  umkd: [['1041', 'Дискретная математика'], ['1042', 'Базы данных'], ['1043', 'Архитектура ЭВМ'], ['1044', 'Английский язык'], ['1045', 'Алгоритмы и структуры данных'], ['1046', 'Физика']],
  files: ['Силлабус дисциплины', 'Конспект лекций', 'Практические занятия', 'Вопросы к рубежному контролю'],
  terms: [{id: 1, label: '1 семестр'}, {id: 2, label: '2 семестр'}],
  chat: [
    ['Что у меня завтра?', 'Завтра, во **вторник 6 октября**, две пары:\n\n1. **09:00–10:45** — Алгоритмы и структуры данных, лекция, каб. 201\n2. **10:55–12:40** — Архитектура ЭВМ, практика, каб. 310 (корпус Б)\n\nК четвергу нужно сдать «Реализовать сортировку слиянием».', null],
    ['Отмени первую пару в среду', 'Первая пара в среду — физика. Отмечаю её отменённой.', 'applied'],
    ['ДЗ по дискретке: задачи 2–5 к следующей паре', 'Записываю задачи 2–5 к дискретной математике на среду, 7 октября.', 'applied'],
  ],
}
const en = {
  grades: [
    ['Discrete Mathematics', 'Akhmetova G.', '88', [['Midterm 1', '91'], ['Midterm 2', '85'], ['Rating', '88'], ['Exam', ''], ['Final', '']], [['2026-09-08', '90', 'Practice'], ['2026-09-15', '85', 'Practice'], ['2026-09-22', '95', 'Self-study'], ['2026-09-29', '82', 'Practice'], ['2026-10-01', '91', 'Midterm 1']]],
    ['Databases', 'Ivanov P.', '94', [['Midterm 1', '96'], ['Midterm 2', '92'], ['Rating', '94'], ['Exam', ''], ['Final', '']], [['2026-09-07', '100', 'Lab'], ['2026-09-14', '95', 'Lab'], ['2026-09-21', '90', 'Lab'], ['2026-09-30', '96', 'Midterm 1']]],
    ['Computer Architecture', 'Kassymov Y.', '71', [['Midterm 1', '68'], ['Midterm 2', '74'], ['Rating', '71'], ['Exam', ''], ['Final', '']], [['2026-09-09', '70', 'Practice'], ['2026-09-23', '65', 'Self-study'], ['2026-10-02', '68', 'Midterm 1']]],
    ['English', 'Smith J.', '97', [['Midterm 1', '98'], ['Midterm 2', '96'], ['Rating', '97'], ['Exam', ''], ['Final', '']], [['2026-09-10', '100', 'Practice'], ['2026-09-24', '95', 'Essay']]],
  ],
  umkd: [['1041', 'Discrete Mathematics'], ['1042', 'Databases'], ['1043', 'Computer Architecture'], ['1044', 'English'], ['1045', 'Algorithms & Data Structures'], ['1046', 'Physics']],
  // File names stay in Russian: the app sorts files into cards by Platonus' Russian titles.
  files: ['Силлабус дисциплины', 'Конспект лекций', 'Практические занятия', 'Вопросы к рубежному контролю'],
  terms: [{id: 1, label: '1 семестр'}, {id: 2, label: '2 семестр'}],
  chat: [
    ['What do I have tomorrow?', 'Tomorrow, **Tuesday 6 October**, you have two classes:\n\n1. **09:00–10:45** — Algorithms & Data Structures, lecture, room 201\n2. **10:55–12:40** — Computer Architecture, practice, room 310 (Building B)\n\n“Implement merge sort” is due on Thursday.', null],
    ['Cancel Wednesday’s first class', 'Wednesday’s first class is physics. Marking it cancelled.', 'applied'],
    ['Discrete math homework: problems 2–5 for the next class', 'Adding problems 2–5 to Discrete Mathematics, due Wednesday 7 October.', 'applied'],
  ],
}

export function demoApi(lang) {
  const d = lang === 'en' ? en : ru
  const journal = {
    year: 2026, term: 1, capturedAt: '2026-10-05T08:40:00Z',
    subjects: d.grades.map(([name, teacher, score, exams, marks], i) => ({
      id: 500 + i, name, teacher, score, finalScore: '',
      exams: exams.map(([n, mark]) => ({name: n, mark, typeId: null})),
      marks: marks.map(([date, mark, type]) => ({date, mark, type})),
    })),
  }
  const turns = d.chat.map(([text, reply, actionStatus], i) => ({
    id: `demo-${i}`, createdAt: `2026-10-05T08:5${i}:00Z`, text, reply, state: 'done',
    actionId: actionStatus ? `demo-action-${i}` : null, actionStatus,
  }))
  /** Returns [status, json] for intercepted paths, or null to let the request through. */
  return (url) => {
    const path = new URL(url).pathname
    if (path === '/api/platonus/connection') return {status: 'connected', credentialsSaved: true, error: null}
    if (path === '/api/platonus/grades/options') return {years: [{id: 2026, label: '2026–2027'}, {id: 2025, label: '2025–2026'}], terms: d.terms, defaultYear: 2026, defaultTerm: 1}
    if (path === '/api/platonus/grades') return journal
    if (path === '/api/platonus/umkd') return {section: {tables: [], error: null, links: d.umkd.map(([id, title]) => ({title, url: umkdUrl(id)}))}, capturedAt: '2026-10-05T08:40:00Z'}
    if (/^\/api\/platonus\/umkd\/\d+\/files$/.test(path)) return d.files.map((name, i) => ({id: i + 1, name, saved: true}))
    if (/^\/api\/platonus\/umkd\/\d+\/files\/\d+\/versions$/.test(path)) return []
    if (path === '/api/assistant') return turns
    return null
  }
}

/** A short sample lecture used as the PDF in the course-materials preview. */
export const lectureHtml = (lang) => lang === 'en' ? `
  <h1>Lecture 5. Graph theory</h1><p class="m">Discrete Mathematics · sample course material</p>
  <h2>1. Basic definitions</h2><p>A <b>graph</b> G = (V, E) is a set of vertices V and a set of edges E, where each edge connects a pair of vertices. A graph is <b>directed</b> if its edges have a direction.</p>
  <p>The <b>degree</b> of a vertex is the number of edges incident to it. For any graph, the sum of degrees equals twice the number of edges: Σ deg(v) = 2|E|.</p>
  <h2>2. Paths and connectivity</h2><p>A <b>path</b> is a sequence of vertices where each consecutive pair is joined by an edge. A graph is <b>connected</b> if there is a path between any two vertices.</p>
  <h2>3. Trees</h2><p>A <b>tree</b> is a connected graph without cycles. A tree with n vertices has exactly n − 1 edges.</p>
  <h2>Exercises</h2><ol><li>Prove that the number of odd-degree vertices is even.</li><li>Draw all non-isomorphic trees with 5 vertices.</li><li>Find a spanning tree of K<sub>4</sub>.</li></ol>` : `
  <h1>Лекция 5. Теория графов</h1><p class="m">Дискретная математика · пример учебного материала</p>
  <h2>1. Основные определения</h2><p><b>Граф</b> G = (V, E) — это множество вершин V и множество рёбер E, где каждое ребро соединяет пару вершин. Граф называется <b>ориентированным</b>, если рёбра имеют направление.</p>
  <p><b>Степень</b> вершины — число рёбер, инцидентных ей. Для любого графа сумма степеней равна удвоенному числу рёбер: Σ deg(v) = 2|E|.</p>
  <h2>2. Пути и связность</h2><p><b>Путь</b> — последовательность вершин, в которой соседние вершины соединены ребром. Граф <b>связный</b>, если между любыми двумя вершинами существует путь.</p>
  <h2>3. Деревья</h2><p><b>Дерево</b> — связный граф без циклов. Дерево с n вершинами содержит ровно n − 1 рёбер.</p>
  <h2>Задания</h2><ol><li>Докажите, что число вершин нечётной степени чётно.</li><li>Нарисуйте все неизоморфные деревья с 5 вершинами.</li><li>Найдите остовное дерево графа K<sub>4</sub>.</li></ol>`
