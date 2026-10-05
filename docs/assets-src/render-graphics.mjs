// Renders the README banner, feature headers and architecture diagram from HTML.
// Style follows the app: Inter, primary #2563eb, 10px radii, calm neutral surfaces.
// Run: npm run graphics   →   docs/images/banner-*.png, feature-*.png, how-it-works-*.png
import puppeteer from 'puppeteer-core'
import {existsSync, mkdirSync, readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'

const out = fileURLToPath(new URL('../images/', import.meta.url)); mkdirSync(out, {recursive: true})
const appIcon = readFileSync(new URL('../../public/campus.svg', import.meta.url), 'utf8')
const platonusLogo = 'data:image/png;base64,' + readFileSync(new URL('../../public/platonus-logo.png', import.meta.url)).toString('base64')
const chrome = process.env.CHROME_PATH ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync)

const theme = {
  light: {bg: '#f8f9fb', card: '#ffffff', fg: '#1b1f29', muted: '#6b7280', border: '#e3e6ec', tint: '#eaf1fe', primary: '#2563eb'},
  dark: {bg: '#13161c', card: '#1a1e26', fg: '#eceff4', muted: '#9aa1ad', border: '#2a2f39', tint: '#1c2a45', primary: '#5b9bf0'},
}
// Lucide icons (ISC license), stroke style matches the app UI.
const icon = {
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
  grad: '<path d="M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z"/><path d="M22 10v6M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  sparkles: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/><path d="M20 3v4M22 5h-4"/>',
  check: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  phone: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  laptop: '<rect width="18" height="12" x="3" y="4" rx="2"/><path d="M2 20h20"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  bell: '<path d="M10.27 21a2 2 0 0 0 3.46 0M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M10 13h4M10 17h4"/>',
  cpu: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/>',
}
const svg = (name, size = 24, color = 'currentColor', width = 2) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${icon[name]}</svg>`

const text = {
  ru: {
    tagline: 'Учебный planner для студентов: расписание, Platonus и AI в одном месте',
    chips: ['Расписание', 'Platonus', 'AI-помощник', 'Telegram · WhatsApp', 'PWA'],
    today: 'Понедельник · Сегодня', now: 'Сейчас', left: 'Осталось 54 мин',
    lessons: [['09:00', 'Дискретная математика', 'Лекция · 304', '#2563eb'], ['10:55', 'Базы данных', 'Лабораторная · 218', '#16a34a'], ['13:10', 'Английский язык', 'Практика · 112', '#db2777']],
    features: {
      schedule: ['Живое расписание', 'День и неделя, числитель/знаменатель, текущая пара с прогрессом'],
      platonus: ['Platonus в один клик', 'Расписание, оценки и УМКД подтягиваются автоматически'],
      ai: ['AI-помощник', 'Отвечает по вашим данным и меняет расписание по команде — с отменой'],
      chats: ['Чаты группы → расписание', 'AI читает выбранные чаты Telegram и WhatsApp и предлагает изменения'],
      tasks: ['Задания и материалы', 'Домашка, заметки и файлы привязаны к конкретной паре'],
      group: ['Группа и телефон', 'Общее расписание для одногруппников, PWA и три языка'],
    },
    d: {
      title: 'Как это работает', sources: 'Источники', core: 'Campus в Cloudflare', result: 'Что видит студент',
      platonus: ['Platonus', 'расписание, журнал, УМКД'], tg: ['Telegram и WhatsApp', 'личный коннектор на вашем ПК'], you: ['Вы', 'редактор и AI-чат'],
      worker: ['Worker API', 'Hono · авторизация · cron'], ws: ['Личное пространство', 'SQLite Durable Object на аккаунт'], ai: ['Workers AI', 'только JSON-действия'], check: ['Проверка', 'Zod · предмет · дата · конфликты · уверенность'],
      out: [['Расписание', 'переносы, отмены, кабинеты'], ['Задания и материалы', 'с файлами к паре'], ['Оценки и УМКД', 'и калькулятор экзамена'], ['Уведомления', 'об изменениях и оценках']],
      review: 'Низкая уверенность → ручное подтверждение · любое действие можно отменить',
    },
  },
  en: {
    tagline: 'A student planner that keeps your schedule, Platonus and AI in one place',
    chips: ['Schedule', 'Platonus', 'AI assistant', 'Telegram · WhatsApp', 'PWA'],
    today: 'Monday · Today', now: 'Now', left: '54 min left',
    lessons: [['09:00', 'Discrete Mathematics', 'Lecture · 304', '#2563eb'], ['10:55', 'Databases', 'Lab · 218', '#16a34a'], ['13:10', 'English', 'Practice · 112', '#db2777']],
    features: {
      schedule: ['A living schedule', 'Day and week views, odd/even weeks, the current class with a progress bar'],
      platonus: ['Platonus in one click', 'Schedule, grades and course materials are imported automatically'],
      ai: ['AI assistant', 'Answers from your own data and edits the schedule on command — with undo'],
      chats: ['Group chats → schedule', 'AI reads the Telegram and WhatsApp chats you pick and proposes changes'],
      tasks: ['Assignments & materials', 'Homework, notes and files are attached to a specific class'],
      group: ['Your group, on your phone', 'A shared schedule for classmates, installable PWA, three languages'],
    },
    d: {
      title: 'How it works', sources: 'Sources', core: 'Campus on Cloudflare', result: 'What the student sees',
      platonus: ['Platonus', 'schedule, journal, materials'], tg: ['Telegram & WhatsApp', 'personal connector on your PC'], you: ['You', 'editor and AI chat'],
      worker: ['Worker API', 'Hono · auth · cron'], ws: ['Personal workspace', 'one SQLite Durable Object per account'], ai: ['Workers AI', 'returns JSON actions only'], check: ['Validation', 'Zod · subject · date · conflicts · confidence'],
      out: [['Schedule', 'moves, cancellations, rooms'], ['Assignments & materials', 'with files per class'], ['Grades & materials', 'plus an exam calculator'], ['Notifications', 'about changes and grades']],
      review: 'Low confidence → manual review · every action can be reverted',
    },
  },
}
const page0 = (body, css = '') => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0}html,body{background:transparent;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}${css}</style></head><body>${body}</body></html>`

function banner(lang) {
  const t = text[lang]
  const cards = t.lessons.map(([time, name, meta, color], i) => `
    <div class="lesson ${i === 2 ? 'live' : ''}" style="--c:${color}">
      <div class="time">${time}</div>
      <div class="body">${i === 2 ? `<span class="badge">${t.now}</span>` : ''}<div class="name">${name}</div><div class="meta">${meta}</div>
      ${i === 2 ? `<div class="bar"><i></i></div><div class="left">${t.left}</div>` : ''}</div>
    </div>`).join('')
  return page0(`<div class="b">
    <div class="dots"></div><div class="glow"></div>
    <div class="l">
      <div class="brand"><div class="ic">${appIcon}</div><h1>Campus</h1></div>
      <p>${t.tagline}</p>
      <div class="chips">${t.chips.map(c => `<span>${c}</span>`).join('')}</div>
    </div>
    <div class="r"><div class="win"><div class="hd"><span></span><span></span><span></span><b>${t.today}</b></div>${cards}</div></div>
  </div>`, `
  .b{position:relative;width:1280px;height:320px;border-radius:24px;overflow:hidden;background:linear-gradient(120deg,#1e40af 0%,#2563eb 48%,#3b82f6 100%);color:#fff;display:flex;align-items:center;padding:0 56px}
  .dots{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.16) 1.2px,transparent 1.2px);background-size:22px 22px;mask-image:linear-gradient(90deg,transparent 0,#000 55%,#000)}
  .glow{position:absolute;right:-120px;top:-160px;width:620px;height:620px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.22),transparent 65%)}
  .l{position:relative;flex:1;max-width:640px}
  .brand{display:flex;align-items:center;gap:20px}.ic svg{width:76px;height:76px;display:block;border-radius:20px;box-shadow:0 0 0 3px rgba(255,255,255,.9),0 10px 30px rgba(15,23,42,.25)}
  h1{font-size:68px;font-weight:700;letter-spacing:-.04em}
  p{margin-top:16px;font-size:22px;line-height:1.4;color:rgba(255,255,255,.88);font-weight:500;letter-spacing:-.01em}
  .chips{margin-top:22px;display:flex;flex-wrap:wrap;gap:8px}.chips span{font-size:14px;font-weight:600;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25)}
  .r{position:relative;margin-left:auto}
  .win{width:400px;background:#f8f9fb;border-radius:16px;padding:14px;box-shadow:0 24px 60px rgba(15,23,42,.35);transform:rotate(-2deg) translateY(6px);color:#1b1f29}
  .hd{display:flex;align-items:center;gap:6px;margin-bottom:10px}.hd span{width:9px;height:9px;border-radius:50%;background:#d6dae2}.hd b{margin-left:8px;font-size:13px;font-weight:600}
  .lesson{display:flex;gap:10px;margin-top:8px}.time{width:40px;font-size:12px;font-weight:600;padding-top:10px;text-align:right}
  .body{flex:1;background:#fff;border:1px solid #e3e6ec;border-left:3px solid var(--c);border-radius:10px;padding:8px 12px}
  .name{font-size:14px;font-weight:600}.meta{font-size:12px;color:#6b7280;margin-top:2px}
  .live .body{border-color:#2563eb;border-left-color:var(--c);box-shadow:0 0 0 3px rgba(37,99,235,.12)}
  .badge{display:inline-block;font-size:11px;font-weight:600;color:#2563eb;background:#eaf1fe;border:1px solid #bfd3fb;border-radius:6px;padding:1px 7px;margin-bottom:4px}
  .bar{height:5px;border-radius:9px;background:#e3e6ec;margin-top:8px;overflow:hidden}.bar i{display:block;width:52%;height:100%;background:#2563eb}
  .left{font-size:11px;color:#6b7280;margin-top:4px;text-align:right}`)
}

function feature(lang, mode, key, n, ic) {
  const c = theme[mode], [title, sub] = text[lang].features[key]
  return page0(`<div class="f"><div class="ic">${svg(ic, 30, c.primary)}</div><div class="n">0${n}</div><div><h2>${title}</h2><p>${sub}</p></div></div>`, `
  .f{width:1280px;height:132px;display:flex;align-items:center;gap:24px;padding:0 36px;background:${c.card};border:1px solid ${c.border};border-radius:18px;position:relative;overflow:hidden}
  .f:before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:${c.primary}}
  .ic{width:64px;height:64px;border-radius:16px;background:${c.tint};display:grid;place-items:center;flex:none}
  .n{font-size:15px;font-weight:600;color:${c.muted};letter-spacing:.06em;font-variant-numeric:tabular-nums}
  h2{font-size:32px;font-weight:600;letter-spacing:-.025em;color:${c.fg}}p{margin-top:6px;font-size:18px;color:${c.muted}}`)
}

function diagram(lang, mode) {
  const c = theme[mode], d = text[lang].d
  const node = (ic, [a, b], accent = c.primary, extra = '') => `<div class="node" style="--a:${accent}">${extra || `<div class="ni">${svg(ic, 22, accent)}</div>`}<div><b>${a}</b><small>${b}</small></div></div>`
  return page0(`<div class="d">
    <div class="cols">
      <div class="col"><h3>${d.sources}</h3>
        ${node('', d.platonus, '#b5232f', `<img class="pl" src="${platonusLogo}">`)}${node('chat', d.tg, '#0ea5e9')}${node('laptop', d.you)}</div>
      <div class="arrow"><span></span></div>
      <div class="col core"><h3>${d.core}</h3>
        ${node('cpu', d.worker)}
        <div class="pair">${node('sparkles', d.ai, '#7c3aed')}${node('shield', d.check, '#16a34a')}</div>
        ${node('file', d.ws)}
        <div class="note">${d.review}</div></div>
      <div class="arrow"><span></span></div>
      <div class="col"><h3>${d.result}</h3>
        ${node('calendar', d.out[0])}${node('check', d.out[1])}${node('grad', d.out[2])}${node('bell', d.out[3])}</div>
    </div></div>`, `
  .d{width:1280px;padding:32px 44px 40px;background:${c.bg};border:1px solid ${c.border};border-radius:22px;color:${c.fg}}
  h2{font-size:30px;font-weight:600;letter-spacing:-.025em;margin-bottom:26px}
  .cols{display:flex;align-items:stretch;gap:0}.col{flex:1;display:flex;flex-direction:column;gap:12px}.core{flex:1.25;background:${c.card};border:1px dashed ${c.border};border-radius:16px;padding:16px}
  h3{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:${c.muted};margin-bottom:4px}
  .node{display:flex;align-items:center;gap:14px;background:${c.card};border:1px solid ${c.border};border-left:3px solid var(--a);border-radius:12px;padding:14px 16px}
  .core .node{background:${c.bg}}
  .ni{width:42px;height:42px;border-radius:11px;display:grid;place-items:center;background:${mode === 'light' ? '#f1f4f9' : '#232834'};flex:none}
  .pl{width:42px;height:42px;border-radius:11px;object-fit:contain;background:#fff;padding:5px;flex:none}
  b{display:block;font-size:17px;font-weight:600}small{display:block;font-size:13.5px;color:${c.muted};margin-top:2px;line-height:1.35}
  .pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}.pair .node{flex-direction:column;align-items:flex-start;gap:10px}
  .note{margin-top:auto;font-size:13.5px;color:${c.muted};background:${c.tint};border-radius:10px;padding:10px 12px;line-height:1.4}
  .arrow{width:56px;position:relative;align-self:center;height:2px}.arrow span{position:absolute;left:8px;right:8px;top:0;height:2px;background:${c.primary}}
  .arrow span:after{content:"";position:absolute;right:-2px;top:-5px;border:6px solid transparent;border-left:8px solid ${c.primary};border-right:0}
`)
}

const browser = await puppeteer.launch({executablePath: chrome, headless: true})
const page = await browser.newPage()
async function render(html, file, width) {
  await page.setViewport({width, height: 200, deviceScaleFactor: 2})
  await page.setContent(html, {waitUntil: 'load', timeout: 60000}); await page.evaluate(() => document.fonts.ready)
  const el = await page.$('body > div')
  await el.screenshot({path: out + file, omitBackground: true}); console.log('  ✓', file)
}
const features = [['schedule', 'calendar'], ['platonus', 'grad'], ['ai', 'sparkles'], ['chats', 'chat'], ['tasks', 'check'], ['group', 'users']]
for (const lang of ['ru', 'en']) {
  await render(banner(lang), `banner-${lang}.png`, 1280)
  for (const mode of ['light', 'dark']) {
    for (const [i, [key, ic]] of features.entries()) await render(feature(lang, mode, key, i + 1, ic), `feature-${key}-${lang}-${mode}.png`, 1280)
    await render(diagram(lang, mode), `how-it-works-${lang}-${mode}.png`, 1280)
  }
}
await browser.close()
