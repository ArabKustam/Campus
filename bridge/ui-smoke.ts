import puppeteer from 'puppeteer'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
const artifacts = fileURLToPath(new URL('../qa-artifacts/', import.meta.url))
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 20000 })
const page = await browser.newPage()
if (process.env.CAMPUS_TEST_URL) { const cdp = await page.createCDPSession(); await cdp.send('Browser.grantPermissions', { origin: new URL(process.env.CAMPUS_TEST_URL).origin, permissions: ['localNetworkAccess'] }) }
const errors: string[] = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 })
console.log('Open browser page')
await page.goto(process.env.CAMPUS_TEST_URL ?? 'http://localhost:5173/', { waitUntil: 'networkidle0' })
async function click(text: string) { console.log('Click:', text); await page.evaluate((text) => { const node = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text); if (!node) throw new Error(`Missing button ${text}`); node.click() }, text) }
await click('Создать аккаунт')
await page.type('input[name="displayName"]', 'Проверка интерфейса')
await page.type('input[name="login"]', `qa-${Date.now()}`)
const password = randomBytes(24).toString('hex')
await page.type('input[name="password"]', password)
console.log('Submit registration')
await page.evaluate(() => document.querySelector('form')!.requestSubmit())
try { await page.waitForFunction(() => document.body.innerText.includes('Неделя №'), { timeout: 10000 }) } catch (error) { console.log(await page.evaluate(() => document.body.innerText)); console.log(errors); await browser.close(); throw error }
await mkdir(artifacts, { recursive: true })
await page.screenshot({ path: `${artifacts}/mobile-schedule.png`, fullPage: true })
await page.evaluate(() => (document.querySelector('button[aria-label="Открыть меню"]') as HTMLButtonElement).click())
await click('Настройки')
await click('Люди и роли')
await page.waitForFunction(() => document.body.innerText.includes('Новый человек'))
await page.screenshot({ path: `${artifacts}/mobile-people.png`, fullPage: true })
await click('WhatsApp')
await page.waitForFunction(() => document.body.innerText.includes('Личный WhatsApp'))
await page.screenshot({ path: `${artifacts}/mobile-connection.png`, fullPage: true })
await click('Показать QR')
try { await page.waitForSelector('img[alt="QR-код входа в WhatsApp"]', { timeout: 55000 }); console.log('Real WhatsApp QR received') } catch (error) { console.log(await page.evaluate(() => document.body.innerText)); await browser.close(); throw error }
await click('Отключить')
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
await writeFile(`${artifacts}/ui-result.json`, JSON.stringify({ errors, overflow }, null, 2))
await page.evaluate(async (password) => { const response = await fetch('/api/auth/account', { method: 'DELETE', headers: { 'content-type': 'application/json', 'x-campus-request': '1' }, body: JSON.stringify({ password }) }); if (!response.ok) throw new Error('QA account cleanup failed') }, password)
await browser.close()
if (errors.length || overflow) throw new Error(JSON.stringify({ errors, overflow }))
console.log('Mobile UI smoke passed')
