// Captures README screenshots and GIFs from the running app.
// 1) In the project root: npm run dev   2) Here: npm run screens
// First run creates a local admin account and classmates, writes ADMIN_ACCOUNT_ID to .dev.vars
// and asks you to restart `npm run dev` once. Output: docs/images/*.png|gif per language and theme.
import puppeteer from 'puppeteer-core'
import {execFileSync, execSync} from 'node:child_process'
import {createHash, randomBytes} from 'node:crypto'
import {mkdirSync, rmSync, existsSync, writeFileSync, readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {seed, removeAccount, apiFor, BASE} from './seed.mjs'
import {demoApi, lectureHtml} from './demo-data.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const out = fileURLToPath(new URL('../images/', import.meta.url))
const tmp = fileURLToPath(new URL('./.frames/', import.meta.url))
const accountsFile = fileURLToPath(new URL('./.demo-accounts.json', import.meta.url))
mkdirSync(out, {recursive: true}); mkdirSync(tmp, {recursive: true})
const chrome = process.env.CHROME_PATH ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync)
const only = process.argv[2] // optional: hero | live | stills | admin
const run = (part) => !only || only === part
const wait = (ms) => new Promise(r => setTimeout(r, ms))
// Monday 5 Oct 2026 in Asia/Almaty (UTC+5). 13:58 is inside the 3rd pair, so the live progress bar shows.
const at = (hhmm) => Date.parse(`2026-10-05T${hhmm}:00+05:00`)
const HERO_TIME = at('13:58')
const W = {desktop: {width: 1280, height: 800}, mobile: {width: 390, height: 844}}
const T = {
  ru: {week: 'Неделя', day: 'День', grades: 'Оценки', calc: 'Калькулятор оценок', tasks: 'Задания', ai: 'AI-помощник', library: 'УМКД', lesson: 'Базы данных', course: 'Дискретная математика', hw: 'Подготовить ER-диаграмму', ask: 'Какие задания горят на этой неделе?', menu: 'Открыть меню', settings: 'Настройки', group: 'Моя группа', time: 'Время', users: 'Пользователи', lectures: 'Лекции'},
  en: {week: 'Week', day: 'Day', grades: 'Grades', calc: 'Grade calculator', tasks: 'Assignments', ai: 'AI assistant', library: 'Course materials', lesson: 'Databases', course: 'Discrete Mathematics', hw: 'Draw the ER diagram', ask: 'Which assignments are due this week?', menu: 'Open menu', settings: 'Settings', group: 'My group', time: 'Time', users: 'Пользователи', lectures: 'Лекции'},
}
const classmates = [['Данияр Ахметов', 'daniyar.a'], ['Камила Нурланова', 'kamila.n'], ['Арман Касымов', 'arman.k'], ['Мадина Ержанова', 'madina.e'], ['Тимур Беков', 'timur.b'], ['Айгерим Садыкова', 'aigerim.s']]

// --- Local SQL helper (the dev server's D1 database) ---
function sql(statement) {
  const file = join(tmpdir(), 'campus-readme.sql'); writeFileSync(file, statement)
  execSync(`npx wrangler d1 execute campus-db --local --file "${file}"`, {cwd: root, stdio: 'pipe'})
}
const sha = (v) => createHash('sha256').update(v).digest('hex')

async function open(browser, lang, theme, {viewport = W.desktop, now = HERO_TIME, demo = false} = {}) {
  const page = await browser.newPage()
  await page.setViewport({...viewport, deviceScaleFactor: viewport === W.mobile ? 2 : 1})
  await page.emulateMediaFeatures([{name: 'prefers-color-scheme', value: theme}])
  await page.evaluateOnNewDocument((lang, fakeNow) => {
    localStorage.setItem('campus-language', lang)
    localStorage.setItem('campus-sidebar-pinned', '1')
    const shift = fakeNow - Date.now(), RealDate = Date
    class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [RealDate.now() + shift])) } static now() { return RealDate.now() + shift } }
    globalThis.Date = FakeDate
  }, lang, now)
  if (demo) {
    // Serve sample Platonus and assistant data in place of the live API (see demo-data.mjs).
    const answer = demoApi(lang), pdf = await lecturePdf(browser, lang)
    await page.setRequestInterception(true)
    page.on('request', (req) => {
      if (req.method() === 'GET' && /\/api\/platonus\/umkd\/\d+\/files\/\d+$/.test(new URL(req.url()).pathname))
        return req.respond({status: 200, contentType: 'application/pdf', body: pdf})
      const data = req.method() === 'GET' && answer(req.url())
      if (data) return req.respond({status: 200, contentType: 'application/json', body: JSON.stringify({ok: true, data})})
      req.continue()
    })
  }
  page.on('pageerror', e => console.warn('  page error:', e.message))
  return page
}
const pdfCache = {}
async function lecturePdf(browser, lang) {
  if (pdfCache[lang]) return pdfCache[lang]
  const p = await browser.newPage()
  await p.setContent(`<meta charset="utf-8"><style>body{font:15px/1.6 Georgia,serif;margin:56px;color:#1b1f29}h1{font:600 28px Inter,Arial,sans-serif;margin:0}h2{font:600 18px Inter,Arial,sans-serif;margin:28px 0 6px}.m{color:#6b7280;margin:6px 0 24px}</style>${lectureHtml(lang)}`)
  pdfCache[lang] = Buffer.from(await p.pdf({format: 'A4', printBackground: true})); await p.close()
  return pdfCache[lang]
}
const clickText = (page, text) => page.evaluate((text) => {
  const n = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === text || b.getAttribute('aria-label') === text)
  if (!n) throw new Error('Missing button ' + text); n.click()
}, text)
const clickLesson = (page, name) => page.evaluate((name) => [...document.querySelectorAll('button,article,[role=button]')].find(e => e.textContent?.includes(name) && e.textContent.length < 300)?.click(), name)
const dayTabs = (page) => page.$$('nav.grid-cols-7 button')
const home = async (page, path = '') => { await page.goto(BASE + path, {waitUntil: 'networkidle0'}); await wait(1200) }
const shot = (page, name) => page.screenshot({path: out + name + '.png'})

// Visible fake cursor so the GIF shows what is clicked.
async function cursor(page) {
  await page.evaluate(() => {
    const c = document.createElement('div'); c.id = 'demo-cursor'
    c.style.cssText = 'position:fixed;z-index:99999;left:640px;top:420px;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(37,99,235,.35);border:2px solid #2563eb;pointer-events:none;transition:left .45s ease,top .45s ease,transform .15s'
    document.body.append(c)
  })
}
async function moveClick(page, handle) {
  const box = await handle.boundingBox(); const x = box.x + box.width / 2, y = box.y + box.height / 2
  await page.evaluate((x, y) => { const c = document.getElementById('demo-cursor'); c.style.left = x + 'px'; c.style.top = y + 'px' }, x, y)
  await wait(550)
  await page.evaluate(() => { document.getElementById('demo-cursor').style.transform = 'scale(.7)' })
  await handle.click(); await wait(150)
  await page.evaluate(() => { document.getElementById('demo-cursor').style.transform = '' })
}
const byText = (page, text) => page.evaluateHandle((text) => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === text), text)
const lessonHandle = (page, name) => page.evaluateHandle((name) => [...document.querySelectorAll('button,article,[role=button]')].find(e => e.textContent?.includes(name) && e.textContent.length < 300), name)

/** Encodes timestamped PNG frames into an optimised GIF. */
function gif(frames, name, width) {
  const list = frames[0][0].replace(/[^/\\]+$/, '') + 'frames.txt'
  writeFileSync(list, frames.map(([file, t], i) => `file '${file}'\nduration ${(((frames[i + 1]?.[1] ?? t + 80) - t) / 1000).toFixed(3)}`).join('\n') + `\nfile '${frames.at(-1)[0]}'\n`)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `fps=12,scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, out + name])
  console.log('  ✓', name)
}

async function hero(browser, lang, theme) {
  const t = T[lang], page = await open(browser, lang, theme, {viewport: {width: 1100, height: 700}})
  await home(page); await cursor(page)
  // Own frame loop with timestamps: CDP screencast drops idle periods, which collapses the pauses.
  const dir = tmp + `hero-${lang}-${theme}/`; mkdirSync(dir, {recursive: true})
  const frames = []; let recording = true
  const loop = (async () => { while (recording) { const file = dir + String(frames.length).padStart(4, '0') + '.png'; await page.screenshot({path: file}); frames.push([file, Date.now()]) } })()
  await wait(1000)
  const tabs = await dayTabs(page)
  await moveClick(page, tabs[1]); await wait(700)
  await moveClick(page, tabs[2]); await wait(700)
  await moveClick(page, await byText(page, t.week)); await wait(1500)
  await moveClick(page, await byText(page, t.day)); await wait(300)
  await moveClick(page, (await dayTabs(page))[0]); await wait(600)
  await moveClick(page, await lessonHandle(page, t.lesson)); await wait(900)
  const input = await page.$('aside input, [role=dialog] input')
  if (input) { await input.type(t.hw, {delay: 30}); await wait(700) }
  // Close the card so the last frame matches the first and the loop has no jump.
  await moveClick(page, await page.$('[role=dialog] aside button[aria-label]')); await wait(1300)
  recording = false; await loop; await page.close()
  gif(frames, `hero-${lang}-${theme}.gif`, 880)
}

// The day list at different moments: before the first class, first half, mid-pair break, second half, between pairs.
const LIVE = ['08:35', '09:20', '09:52', '10:28', '10:49']
async function live(browser, lang, theme) {
  const t = T[lang], dir = tmp + `live-${lang}-${theme}/`; mkdirSync(dir, {recursive: true})
  const frames = [], shots = []; let clock = Date.now()
  for (const [i, hhmm] of LIVE.entries()) {
    const page = await open(browser, lang, theme, {viewport: {width: 1100, height: 900}, now: at(hhmm)})
    await home(page)
    const clip = await page.evaluate((label, hhmm, second) => {
      const tabs = document.querySelector('nav.grid-cols-7').getBoundingClientRect()
      // Bottom of the second lesson card: the bordered box around the lesson title.
      const title = [...document.querySelectorAll('main *')].find(e => e.children.length === 0 && e.textContent.trim().startsWith(second))
      let card = title; while (card && !(String(card.className).includes('border') && card.getBoundingClientRect().height > 80)) card = card.parentElement
      const bottom = (card ?? title).getBoundingClientRect().bottom
      const chip = document.createElement('div')
      chip.textContent = `🕘 ${label}: ${hhmm}`
      chip.style.cssText = 'position:absolute;z-index:9999;padding:6px 12px;border-radius:999px;font:600 14px Inter,system-ui;background:#2563eb;color:#fff;box-shadow:0 4px 14px rgba(37,99,235,.35)'
      document.body.append(chip)
      // Right-aligned over the "N classes" counter so nothing peeks out beside it.
      chip.style.left = (tabs.right - chip.offsetWidth + 4 + scrollX) + 'px'; chip.style.top = (tabs.bottom + 10 + scrollY) + 'px'
      return {x: tabs.left - 8, y: tabs.bottom + 4, width: tabs.width + 16, height: bottom - tabs.bottom + 8}
    }, t.time, hhmm, t.lesson)
    shots.push([page, clip])
  }
  // Every frame gets the same size: the tallest state (a running class adds a progress bar).
  const height = Math.max(...shots.map(([, c]) => c.height))
  for (const [i, [page, clip]] of shots.entries()) {
    const file = dir + `${i}.png`
    await page.screenshot({path: file, clip: {...clip, height}})
    frames.push([file, clock]); clock += 1900
    await page.close()
  }
  frames.push([frames[0][0], clock]) // hold the loop point
  gif(frames, `live-${lang}-${theme}.gif`, 820)
}

async function stills(browser, lang, theme) {
  const t = T[lang], s = (n) => `${n}-${lang}-${theme}`
  let page = await open(browser, lang, theme, {demo: true})
  await home(page)
  await clickText(page, t.week); await wait(900); await shot(page, s('schedule-week'))
  await clickText(page, t.day); await wait(600); await clickLesson(page, t.lesson); await wait(1000)
  await shot(page, s('lesson'))
  await page.keyboard.press('Escape'); await wait(400)
  await clickText(page, t.tasks); await wait(1000); await shot(page, s('tasks'))
  await clickText(page, t.ai); await wait(1200)
  await page.type('textarea', t.ask); await wait(300); await shot(page, s('assistant'))
  await clickText(page, t.grades); await wait(1500); await shot(page, s('grades'))
  await clickText(page, t.calc); await wait(700)
  await page.select('[role=dialog] select', '500').catch(() => {}); await wait(600)
  await shot(page, s('grade-calc'))
  await page.keyboard.press('Escape'); await wait(400)
  await clickText(page, t.library); await wait(1200)
  await page.evaluate((name) => [...document.querySelectorAll('main button')].find(b => b.textContent?.trim() === name)?.click(), t.course); await wait(1200)
  await shot(page, s('umkd-files'))
  await page.evaluate((name) => [...document.querySelectorAll('[role=dialog] button')].find(b => b.textContent?.trim().startsWith(name))?.click(), t.lectures); await wait(3500); await shot(page, s('umkd-pdf'))
  await page.keyboard.press('Escape'); await wait(300); await page.keyboard.press('Escape'); await wait(300)
  // The messenger settings are not translated yet, so this screen is captured for ru only.
  if (lang === 'ru') { await clickText(page, t.settings); await wait(900); await clickText(page, 'Telegram'); await wait(1200); await shot(page, s('messengers')) }
  await page.close()
  page = await open(browser, lang, theme, {viewport: W.mobile, demo: true})
  await home(page); await page.screenshot({path: out + s('mobile') + '.png'})
  await clickText(page, t.menu); await wait(700); await page.screenshot({path: out + s('mobile-menu') + '.png'})
  await page.close()
}

/** Sample month of usage for the classmates so the admin charts have a shape (local demo DB only). */
function usageHistory(mates) {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const pages = ['schedule', 'schedule', 'schedule', 'grades', 'library', 'assistant', 'tasks']
  const rows = [], intervals = [], now = Date.now(), day = 86400000
  for (const [m, mate] of mates.entries()) {
    const joined = 8 + Math.floor(rnd() * 22)
    rows.push(`UPDATE accounts SET created_at='${new Date(now - joined * day).toISOString()}' WHERE id='${mate.id}';`)
    for (let d = joined; d >= 1; d--) {
      const weekday = new Date(now - d * day).getDay()
      if (rnd() > (weekday === 0 || weekday === 6 ? 0.25 : 0.8)) continue
      const device = rnd() < 0.6 ? 'phone' : 'desktop'
      for (let k = 0; k < 1 + Math.floor(rnd() * 4); k++) {
        const t = now - d * day + Math.floor((8 + rnd() * 12) * 3600000), length = Math.floor((3 + rnd() * 25) * 60000), page = pages[Math.floor(rnd() * pages.length)]
        rows.push(`INSERT INTO account_events(id,account_id,kind,page,device,browser,detail,created_at) VALUES('${crypto.randomUUID()}','${mate.id}','page.view','${page}','${device}','Chrome',NULL,${t});`)
        intervals.push(`INSERT INTO activity_intervals(id,account_id,started_at,ended_at,page,device) VALUES('${crypto.randomUUID()}','${mate.id}',${t},${t + length},'${page}','${device}');`)
      }
    }
    if (m % 2 === 0) rows.push(`INSERT OR REPLACE INTO account_profiles(account_id,platonus_name,platonus_group,connected,last_sync_at,updated_at) VALUES('${mate.id}','${mate.name}','ВТ-24-1',1,'${new Date(now - 3600000).toISOString()}',${now});`)
  }
  return [...rows, ...intervals].join('\n')
}

// --- Persistent accounts: admin (its ID lives in .dev.vars) and classmates for the admin list ---
async function ensureAdmin(browser) {
  const page = await browser.newPage(); await page.goto(BASE, {waitUntil: 'networkidle0'})
  const api = apiFor(page)
  let saved = existsSync(accountsFile) ? JSON.parse(readFileSync(accountsFile, 'utf8')) : null
  const login = async (a) => api('/api/auth/login', 'POST', {login: a.login, password: a.password}).then(r => r.data).catch(() => null)
  let me = saved && await login(saved.admin)
  if (!me) {
    const mates = []
    const register = async (displayName, login) => {
      const account = {login, password: randomBytes(18).toString('hex'), name: displayName}
      account.id = (await api('/api/auth/register', 'POST', {login, password: account.password, displayName})).data.id
      await api('/api/onboarding', 'POST')
      // A little real usage so the admin analytics are not empty: page views and visible-time heartbeats.
      const pages = ['schedule', 'grades', 'library', 'assistant', 'tasks', 'schedule', 'grades', 'schedule']
      for (const p of pages.slice(0, 3 + mates.length)) {
        await api('/api/activity/event', 'POST', {id: crypto.randomUUID(), page: p}).catch(() => {})
        await api('/api/activity', 'POST', {elapsed: 60000, mobile: mates.length % 2 === 0, installed: mates.length % 3 === 0, page: p}).catch(() => {})
      }
      return account
    }
    for (const [name, login] of classmates) mates.push(await register(name, login))
    saved = {admin: await register('Администратор', 'admin'), classmates: mates}
    sql(usageHistory(mates))
    writeFileSync(accountsFile, JSON.stringify(saved, null, 2))
    const vars = join(root, '.dev.vars'), old = existsSync(vars) ? readFileSync(vars, 'utf8').replace(/^ADMIN_ACCOUNT_ID=.*\n?/m, '') : ''
    writeFileSync(vars, `${old}ADMIN_ACCOUNT_ID=${saved.admin.id}\n`)
    me = await login(saved.admin)
  }
  await page.close()
  if (!me?.isAdmin) { console.log('\nADMIN_ACCOUNT_ID was written to .dev.vars. Restart `npm run dev` and run this script again.'); process.exit(2) }
  return saved
}
async function admin(browser, saved, lang, theme) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.setViewport(W.desktop)
  await page.emulateMediaFeatures([{name: 'prefers-color-scheme', value: theme}])
  await page.evaluateOnNewDocument((lang) => { localStorage.setItem('campus-language', lang); localStorage.setItem('campus-sidebar-pinned', '1') }, lang)
  await page.goto(BASE, {waitUntil: 'networkidle0'})
  const api = apiFor(page)
  await api('/api/auth/login', 'POST', {login: saved.admin.login, password: saved.admin.password})
  // The admin panel is unlocked by a 6-digit code sent to Telegram. Locally we store a known code
  // for this account and go through the same /api/admin/unlock endpoint.
  const code = String(100000 + (randomBytes(3).readUIntBE(0, 3) % 900000))
  sql(`INSERT OR REPLACE INTO admin_challenges(account_id,code_hash,expires_at,attempts,sent_at) VALUES('${saved.admin.id}','${sha(code)}',${Date.now() + 300000},0,${Date.now()});`)
  await api('/api/admin/unlock', 'POST', {code})
  await home(page, '/admin'); await wait(1500)
  await shot(page, `admin-analytics-${lang}-${theme}`)
  await page.evaluate((label) => [...document.querySelectorAll('nav button')].find(b => b.textContent?.startsWith(label))?.click(), T[lang].users); await wait(1500)
  await shot(page, `admin-users-${lang}-${theme}`)
  await ctx.close()
}

// Repeated local runs hit the login rate limit (10 per 10 min); reset the local counters first.
sql('DELETE FROM auth_attempts;')
const browser = await puppeteer.launch({executablePath: chrome, headless: true})
const saved = await ensureAdmin(browser)
for (const lang of ['ru', 'en']) {
  console.log('Language:', lang)
  if (run('stills')) {
    // Onboarding screen: an account that has not connected Platonus yet. It is always light.
    const fresh = await open(browser, lang, 'light')
    const blank = await seed(fresh, lang, {fill: false})
    await home(fresh); await shot(fresh, `onboarding-${lang}`)
    await removeAccount(blank.api, blank.password); await fresh.close()
  }
  // Main demo account; its session cookie is shared by every page of this browser context.
  // A previous run's demo account may still be finishing deletion; free its readable login.
  sql(`DELETE FROM accounts WHERE login='aliya.${lang}' OR login LIKE 'aliya.1%';`)
  const setup = await open(browser, lang, 'light')
  const demo = await seed(setup, lang)
  for (const theme of ['light', 'dark']) {
    if (run('hero')) await hero(browser, lang, theme)
    if (run('live')) await live(browser, lang, theme)
    if (run('stills')) { await stills(browser, lang, theme); console.log('  ✓ stills', theme) }
    if (run('admin')) { await admin(browser, saved, lang, theme); console.log('  ✓ admin', theme) }
  }
  await removeAccount(demo.api, demo.password); await setup.close()
}
await browser.close()
rmSync(tmp, {recursive: true, force: true})
