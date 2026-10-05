// Captures README screenshots and the hero GIF from the running app.
// 1) In the project root: npm run dev   2) Here: npm run screens
// Output: docs/images/*.png|gif, one file per language (ru/en) and theme (light/dark).
import puppeteer from 'puppeteer-core'
import {execFileSync} from 'node:child_process'
import {mkdirSync, rmSync, existsSync, writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {seed, removeAccount, BASE} from './seed.mjs'

const out = fileURLToPath(new URL('../images/', import.meta.url))
const tmp = fileURLToPath(new URL('./.frames/', import.meta.url))
mkdirSync(out, {recursive: true}); mkdirSync(tmp, {recursive: true})
const chrome = process.env.CHROME_PATH ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync)
const only = process.argv[2] // optional: "hero" to record only the GIF
const wait = (ms) => new Promise(r => setTimeout(r, ms))
// Monday 5 Oct 2026, 13:58 Asia/Almaty — the 3rd pair is running, so the live progress bar shows.
const FAKE_NOW = Date.parse('2026-10-05T08:58:00Z')
const W = {desktop: {width: 1280, height: 800}, mobile: {width: 390, height: 844}}
const T = {
  ru: {week: 'Неделя', day: 'День', grades: 'Оценки', calc: 'Калькулятор оценок', tasks: 'Задания', ai: 'AI-помощник', lesson: 'Базы данных', hw: 'Подготовить ER-диаграмму', ask: 'Что у меня завтра и какие задания горят?', menu: 'Открыть меню', settings: 'Настройки', group: 'Моя группа'},
  en: {week: 'Week', day: 'Day', grades: 'Grades', calc: 'Grade calculator', tasks: 'Assignments', ai: 'AI assistant', lesson: 'Databases', hw: 'Draw the ER diagram', ask: 'What do I have tomorrow and what is due soon?', menu: 'Open menu', settings: 'Settings', group: 'My group'},
}

async function open(browser, lang, theme, viewport = W.desktop) {
  const page = await browser.newPage()
  await page.setViewport({...viewport, deviceScaleFactor: viewport === W.mobile ? 2 : 1})
  await page.emulateMediaFeatures([{name: 'prefers-color-scheme', value: theme}])
  await page.evaluateOnNewDocument((lang, fakeNow) => {
    localStorage.setItem('campus-language', lang)
    localStorage.setItem('campus-sidebar-pinned', '1')
    const shift = fakeNow - Date.now(), RealDate = Date
    class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [RealDate.now() + shift])) } static now() { return RealDate.now() + shift } }
    globalThis.Date = FakeDate
  }, lang, FAKE_NOW)
  page.on('pageerror', e => console.warn('  page error:', e.message))
  return page
}
const clickText = (page, text) => page.evaluate((text) => {
  const n = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === text || b.getAttribute('aria-label') === text)
  if (!n) throw new Error('Missing button ' + text); n.click()
}, text)
const clickLesson = (page, name) => page.evaluate((name) => [...document.querySelectorAll('button,article,[role=button]')].find(e => e.textContent?.includes(name) && e.textContent.length < 300)?.click(), name)
const dayTabs = (page) => page.$$('nav.grid-cols-7 button')
const home = async (page) => { await page.goto(BASE, {waitUntil: 'networkidle0'}); await wait(1200) }
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

async function hero(browser, lang, theme) {
  const t = T[lang], page = await open(browser, lang, theme, {width: 1100, height: 700})
  await home(page); await cursor(page)
  // Own frame loop with timestamps: CDP screencast drops idle periods, which collapses the pauses.
  const dir = tmp + `hero-${lang}-${theme}/`; mkdirSync(dir, {recursive: true})
  const frames = []; let recording = true
  const loop = (async () => {
    while (recording) {
      const file = dir + String(frames.length).padStart(4, '0') + '.png'
      await page.screenshot({path: file}); frames.push([file, Date.now()])
    }
  })()
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
  const list = dir + 'frames.txt'
  writeFileSync(list, frames.map(([file, at], i) => `file '${file}'\nduration ${(((frames[i + 1]?.[1] ?? at + 80) - at) / 1000).toFixed(3)}`).join('\n') + `\nfile '${frames.at(-1)[0]}'\n`)
  // Two-pass palette keeps the GIF crisp and small.
  const gif = out + `hero-${lang}-${theme}.gif`
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', 'fps=12,scale=880:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', gif])
  console.log('  ✓', gif.split('/').pop())
}

async function stills(browser, lang, theme) {
  const t = T[lang], s = (n) => `${n}-${lang}-${theme}`
  let page = await open(browser, lang, theme)
  await home(page); await shot(page, s('schedule-day'))
  await clickText(page, t.week); await wait(900); await shot(page, s('schedule-week'))
  await clickText(page, t.day); await wait(600); await clickLesson(page, t.lesson); await wait(1000)
  await shot(page, s('lesson'))
  await page.keyboard.press('Escape'); await wait(400)
  await clickText(page, t.tasks); await wait(1000); await shot(page, s('tasks'))
  await clickText(page, t.ai); await wait(1000)
  await page.type('textarea', t.ask); await wait(300); await shot(page, s('assistant'))
  await clickText(page, t.grades); await wait(900); await clickText(page, t.calc); await wait(700)
  await page.type('[role=dialog] input[type=number], [role=dialog] input', '68'); await wait(500)
  await shot(page, s('grades'))
  await page.keyboard.press('Escape'); await wait(400)
  await clickText(page, t.group); await wait(900); await shot(page, s('group'))
  // The messenger settings are not translated yet, so this screen is captured for ru only.
  if (lang === 'ru') { await clickText(page, t.settings); await wait(900); await clickText(page, 'Telegram'); await wait(1200); await shot(page, s('messengers')) }
  await page.close()
  page = await open(browser, lang, theme, W.mobile)
  await home(page); await page.screenshot({path: out + s('mobile') + '.png'})
  await clickText(page, t.menu); await wait(700); await page.screenshot({path: out + s('mobile-menu') + '.png'})
  await page.close()
}

const browser = await puppeteer.launch({executablePath: chrome, headless: true})
for (const lang of ['ru', 'en']) {
  console.log('Language:', lang)
  // Onboarding screen: an account that has not connected Platonus yet.
  const fresh = await open(browser, lang, 'light')
  const blank = await seed(fresh, lang, {fill: false})
  // The onboarding screen is always light, so one shot per language.
  if (!only) { await home(fresh); await shot(fresh, `onboarding-${lang}`) }
  await removeAccount(blank.api, blank.password); await fresh.close()
  // Main demo account; its session cookie is shared by every page of this browser.
  const setup = await open(browser, lang, 'light')
  const demo = await seed(setup, lang)
  for (const theme of ['light', 'dark']) {
    await hero(browser, lang, theme)
    if (!only) { await stills(browser, lang, theme); console.log('  ✓ stills', theme) }
  }
  await removeAccount(demo.api, demo.password); await setup.close()
}
await browser.close()
rmSync(tmp, {recursive: true, force: true})
