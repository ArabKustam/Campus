<p align="center">
  <img src="docs/images/banner-en.png" alt="Campus — a student planner that keeps your schedule, Platonus and AI in one place" width="100%">
</p>

<p align="center">
  <a href="https://campus-planner.mymemory9.workers.dev"><b>Open Campus</b></a> ·
  <a href="#-quick-start">Install</a> ·
  <a href="docs/ARCHITECTURE.md">Architecture</a> ·
  <a href="#-api">API</a> ·
  <a href="https://github.com/ArabKustam/Campus/issues">Report a bug</a> ·
  <a href="README.ru.md">🇷🇺 Русский</a>
</p>

<p align="center">
  <a href="https://campus-planner.mymemory9.workers.dev"><img alt="Live demo" src="https://img.shields.io/badge/demo-live-2563eb?style=flat-square&logo=cloudflare&logoColor=white"></a>
  <img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare-Workers%20·%20D1%20·%20AI-1e40af?style=flat-square&logo=cloudflareworkers&logoColor=white">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-3b82f6?style=flat-square&logo=react&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6-2563eb?style=flat-square&logo=typescript&logoColor=white">
  <img alt="PWA" src="https://img.shields.io/badge/PWA-iOS%20·%20Android%20·%20desktop-16a34a?style=flat-square">
  <img alt="Languages" src="https://img.shields.io/badge/UI-RU%20·%20EN%20·%20KZ-6b7280?style=flat-square">
</p>

**Campus** puts a student's university life in one window: a schedule that knows which class is on right now, grades and course materials from Platonus, assignments and files attached to each class, an AI assistant, and automatic parsing of your group's Telegram and WhatsApp chats. It runs in the browser and installs on your phone like an app.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/hero-en-dark.gif">
    <img src="docs/images/hero-en-light.gif" alt="Campus schedule: switching days, week view, opening a class and adding homework" width="880">
  </picture>
</p>

## ✨ Features

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/feature-schedule-en-dark.png">
  <img src="docs/images/feature-schedule-en-light.png" alt="01 · A living schedule" width="100%">
</picture>

Day and week views, odd and even weeks, holidays and the academic week number. The current class is highlighted with a progress bar and a countdown to the break. Moves, cancellations and room changes apply to a single date and never break the regular timetable.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/schedule-week-en-dark.png">
  <img src="docs/images/schedule-week-en-light.png" alt="Week schedule" width="100%">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/feature-platonus-en-dark.png">
  <img src="docs/images/feature-platonus-en-light.png" alt="02 · Platonus in one click" width="100%">
</picture>

On first sign-in your Platonus login is all it takes: Campus imports the schedule, journal grades and course materials (UMKD), then keeps them up to date. The calculator shows what you need on the exam for the grade you want, and the formula can be adjusted to match your syllabus.

<table>
  <tr>
    <td width="50%"><img src="docs/images/onboarding-en.png" alt="Connecting Platonus on first sign-in"></td>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/grades-en-dark.png"><img src="docs/images/grades-en-light.png" alt="Exam grade calculator"></picture></td>
  </tr>
</table>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/feature-ai-en-dark.png">
  <img src="docs/images/feature-ai-en-light.png" alt="03 · AI assistant" width="100%">
</picture>

Ask “What do I have tomorrow?” or “How many points am I short of 90?” and the assistant answers from your schedule, assignments and grades. You can also give it tasks, such as “Cancel the first class on Friday in two weeks” or “Calculus homework: problems 1–5 for the next class”. If a request is ambiguous it asks a follow-up, and every action it takes can be undone. Send it a photo of the whiteboard, a screenshot or a PDF and it reads the file and attaches it to the right class.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/assistant-en-dark.png">
  <img src="docs/images/assistant-en-light.png" alt="AI assistant chat" width="100%">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/feature-chats-en-dark.png">
  <img src="docs/images/feature-chats-en-light.png" alt="04 · Group chats → schedule" width="100%">
</picture>

A small connector on your computer links to Telegram and WhatsApp by QR code, like any other linked device. Campus receives messages **only from the chats you pick**. AI turns “no first class tomorrow” or “the lab moves to room 420” into proposed schedule changes. Each proposal is checked for subject, date, conflicts and model confidence. Only the action types you allow are applied automatically; everything else waits for your approval on the Processing page.

- QR sign-in, sessions stay on your machine
- Messages from unselected chats are rejected before they reach the server
- Every applied change keeps its source message and can be reverted

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/feature-tasks-en-dark.png">
  <img src="docs/images/feature-tasks-en-light.png" alt="05 · Assignments & materials" width="100%">
</picture>

Add homework straight from a class card: for this class, the next one or any date. Notes, links and files (photos, PDFs, documents) live with the specific lesson too. All assignments and deadlines are collected on one page.

<table>
  <tr>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/lesson-en-dark.png"><img src="docs/images/lesson-en-light.png" alt="Class card with homework and files"></picture></td>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/tasks-en-dark.png"><img src="docs/images/tasks-en-light.png" alt="Assignment list"></picture></td>
  </tr>
</table>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/feature-group-en-dark.png">
  <img src="docs/images/feature-group-en-light.png" alt="06 · Your group, on your phone" width="100%">
</picture>

The group leader creates a group and shares an invite link. Classmates get a shared schedule, assignments and course materials, with roles (leader, deputy, member) and subgroups. Campus installs as a PWA, follows your light or dark theme, and the interface is available in Russian, English and Kazakh.

<table>
  <tr>
    <td width="25%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/mobile-en-dark.png"><img src="docs/images/mobile-en-light.png" alt="Mobile schedule"></picture></td>
    <td width="25%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/mobile-menu-en-dark.png"><img src="docs/images/mobile-menu-en-light.png" alt="Mobile menu"></picture></td>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/group-en-dark.png"><img src="docs/images/group-en-light.png" alt="Creating a group or joining by invite"></picture></td>
  </tr>
</table>

## 🧭 How it works

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/how-it-works-en-dark.png">
  <img src="docs/images/how-it-works-en-light.png" alt="Diagram: Platonus, messengers and the user → Worker API, Workers AI and validation → schedule, assignments, grades, notifications" width="100%">
</picture>

- **Frontend:** React 19, TypeScript, Tailwind CSS, Vite, PWA.
- **Backend:** a Cloudflare Worker built on Hono. Accounts and sessions live in D1, and each user's data lives in their own SQLite Durable Object.
- **AI:** Workers AI returns structured JSON actions only (`ADD_HOMEWORK`, `CANCEL_LESSON`, `MOVE_LESSON`, `CHANGE_ROOM` …). They are validated by Zod and then by business rules. The model never sees SQL and never writes to the database.
- **Connector** (`bridge/`): a local Node.js process for Telegram (MTProto) and WhatsApp Web. Messenger sessions stay on your computer.

The processing pipeline, context limits and the legacy backend are documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (in Russian).

## 📋 Requirements

- Node.js 22 LTS or newer
- To deploy: a Cloudflare account (Workers, D1, Durable Objects, Workers AI)
- For the messenger connector: a computer that stays on, plus your own API ID/API Hash from [my.telegram.org/apps](https://my.telegram.org/apps) for Telegram

## 🚀 Quick start

The hosted version runs at **[campus-planner.mymemory9.workers.dev](https://campus-planner.mymemory9.workers.dev)**. Create an account and connect Platonus.

Run it locally:

```bash
git clone https://github.com/ArabKustam/Campus.git
cd Campus
npm install
npm run build:client
npm run db:migrate:local
npx wrangler d1 execute campus-db --local --file account-migrations/0002_groups.sql
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to Wrangler (`127.0.0.1:8787`). New accounts don't get AI, groups, messengers or assignments by default. The administrator (`ADMIN_ACCOUNT_ID`) turns them on in the admin panel.

Deploy to Cloudflare:

```bash
npm run db:migrate:remote
npm run deploy
```

Before deploying, put your resource IDs and `PUBLIC_APP_URL` into `wrangler.production.jsonc` and set secrets with `wrangler secret put`.

## ⚙️ Configuration

| Setting | Where | Purpose |
|---|---|---|
| `AI_MODEL` | `wrangler*.jsonc` → `vars` | Workers AI model for message parsing (default `@cf/google/gemma-4-26b-a4b-it`) |
| `ASSISTANT_MODEL` | `vars` | Separate model for the AI assistant (optional) |
| `PUBLIC_APP_URL` | `vars` | Public site URL, used for invites and Origin checks |
| `CREDENTIALS_ENCRYPTION_KEY` | secret | Encrypts saved Platonus credentials |
| `ADMIN_ACCOUNT_ID` | secret / `vars` | Administrator account: admin panel and feature access |
| `WHATSAPP_BRIDGE_SECRET` | secret | Shared secret between the Worker and the connector |
| `CAMPUS_APP_URL` | `bridge/.env` | The site the connector accepts requests from |
| `automation.minimumConfidence`, `automation.autoApply` | Settings → Automation | Confidence threshold and which action types AI may apply on its own |

## 🛠 Commands

| Command | What it does |
|---|---|
| `npm run dev` | Worker + Vite with hot reload |
| `npm run build` | Type checks, frontend build, Worker dry run |
| `npm test` | Worker, frontend and legacy tests |
| `npm run lint` | oxlint |
| `npm run db:migrate:local` / `:remote` | D1 migrations |
| `npm run deploy` | Build and publish with `wrangler.production.jsonc` |
| `npm run connector` | Start the local messenger connector |

To run the connector on another computer, download it in the app: **Settings → Telegram/WhatsApp → How to run the connector**. Unzip it and run `npm ci && npm start` ([guide, in Russian](bridge/README.md)).

## 🔌 API

Every request runs as the signed-in user (cookie session). Requests that change data need the `X-Campus-Request: 1` header.

```js
// Schedule for a given day
const day = await fetch('/api/schedule/day?date=2026-10-05').then(r => r.json())

// New assignment for a class
await fetch('/api/homework', {
  method: 'POST',
  headers: {'content-type': 'application/json', 'x-campus-request': '1'},
  body: JSON.stringify({
    subjectId: 'subject-id',
    scheduleSlotId: 'slot-id',
    title: 'Lab #3: database normalization',
    dueAt: '2026-10-08T23:59:00+05:00',
  }),
})
```

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/schedule?from=&to=` · `/api/schedule/day?date=` | Schedule with moves and cancellations applied |
| `GET/POST/PATCH` | `/api/catalog/{subjects,teachers,slots}` | Subjects, teachers, regular classes |
| `GET/POST/PATCH` | `/api/homework` · `/api/materials` | Assignments and materials |
| `POST` | `/api/processing/run` | Start AI parsing of new messages (202) |
| `POST` | `/api/actions/:id/{apply,reject,revert}` | AI proposal lifecycle |

## ❓ FAQ

<details>
<summary><b>Does Campus store my Platonus password?</b></summary>

Only if you tick “Remember sign-in details”. In that case the login and password are stored encrypted (`CREDENTIALS_ENCRYPTION_KEY`) and data refreshes automatically. Without it, every refresh needs a new sign-in.
</details>

<details>
<summary><b>Which universities are supported?</b></summary>

The Platonus address is currently set to `platonus.kstu.kz` (`worker/services/platonus-api.ts`). For another university on Platonus, change `PLATONUS_ORIGIN` and check the page parsing. Without Platonus you can keep the schedule by hand: choose “Set up manually” on first sign-in.
</details>

<details>
<summary><b>Which messages does the AI see?</b></summary>

Only messages from the chats selected in settings, starting from 30 August 2026. The text is processed by Cloudflare Workers AI. Private chats and unselected groups are rejected before anything is sent to the server.
</details>

<details>
<summary><b>Does the connector have to keep running?</b></summary>

Yes. It's a regular program on your computer, not a cloud service. While it's closed, new messages aren't synced. Running `npm start` again resumes the saved connections.
</details>

## 💬 Support

- Bugs and ideas: [GitHub Issues](https://github.com/ArabKustam/Campus/issues)
- In the app: **Help and feedback** in the sidebar

## 📄 License

No license file has been added yet, so all rights are reserved by the author.

<sub>README images are built by the scripts in [`docs/assets-src`](docs/assets-src): screenshots are captured from the app running locally, and the banner and diagram are rendered from HTML.</sub>
