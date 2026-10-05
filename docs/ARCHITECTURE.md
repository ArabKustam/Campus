# Campus — архитектура и backend

> Техническое описание, перенесённое из прежнего README. Обзор проекта — в [README](../README.md).

Университетский planner на React, TypeScript и Tailwind CSS. Основной backend — Cloudflare Worker (Hono), D1, R2 и Workers AI.

## Основной запуск: Cloudflare Worker

```bash
npm install
npm run build:client
npm run db:migrate:local
npm run dev
```

Vite проксирует `/api` на Wrangler (`127.0.0.1:8787`). `npm run build` проверяет frontend/Worker TypeScript, собирает frontend и выполняет Wrangler **dry-run**, без deployment. `npm start` запускает локальный Worker. Production IDs и URL в `wrangler.jsonc` нужно настроить отдельно; реальные Cloudflare ресурсы и секреты автоматически не создаются.

## AI processing pipeline

Backend до вызова модели вычисляет локальную дату/время (часовой пояс `app.timezone`, по умолчанию `Asia/Almaty`), день недели, чётность, фактические занятия дня, текущую/предыдущую/следующую пару и ближайшие даты упомянутых предметов. Отмены и переносы учитываются через `lesson_overrides`, шаблон не меняется. Будущие занятия передаются с ID слота, фактической и исходной датой.

Обработка идёт небольшими пакетами. У каждого сообщения есть окно предыдущих и следующих **уже сохранённых** сообщений той же группы и цепочка reply. Сообщения, которые ещё не поступили, недоступны. Приоритет: название предмета → преподаватель → дата/день → reply → соседние сообщения → текущая пара → ближайшая пара. Неоднозначное определение не является подтверждённым фактом.

Модель возвращает только structured JSON (`actions`), проверяемый Zod. Она не получает SQL, инструменты доступа к базе или право записи. Поддерживаются `ADD_HOMEWORK`, `ADD_NOTE`, `ADD_MATERIAL`, `ADD_BOOK_LIST`, `ADD_LINK`, `CANCEL_LESSON`, `MOVE_LESSON`, `CHANGE_ROOM`, `CHANGE_TIME`, `SET_ONLINE`, `IGNORE`, `UNKNOWN`.

Перед применением backend проверяет предмет, дату и занятие, дубли и конфликты. Автоприменение требует успешной проверки, `confidence >= automation.minimumConfidence` и явно включённого разрешения соответствующего типа в `automation.autoApply`. Низкая уверенность и ошибки проверки остаются предложениями для ручной проверки; `IGNORE`/`UNKNOWN` не изменяют учебные данные.

Связь хранится через `ai_actions.message_id`, `applied_entity_type`, `applied_entity_id`; обратная операция — в `revert_payload_json`. Изменения доступны через apply/reject/revert API, а не прямую запись модели. При конфликте возврат должен быть отклонён, а не затирать более поздние правки.

- `POST /api/processing/run` — асинхронный запуск (202); состояние читать через `GET /api/processing`.
- `PATCH /api/actions/:id` — редактирование предложения с повторной проверкой.
- `POST /api/actions/:id/apply`, `/reject`, `/revert` — жизненный цикл.
- Cron использует тот же processing service.

Для локальных тестов ответ модели подставляется через `AiRunner`; это не подтверждает качество реальной модели. Настоящий Workers AI требует Cloudflare binding и авторизации. `wrangler.test.jsonc` намеренно не содержит AI binding и не вызывает платную модель.

Контекст ограничен: до 20 текущих сообщений за запуск, до 10 соседей с каждой стороны, reply до 5 звеньев, до 4 будущих дат предмета в горизонте 42 дней. Цитата reply сохраняется даже когда исходное сообщение не было импортировано; неизвестные ID и время такой цитаты остаются `null`.

HTTP smoke без внешнего AI и секретов (отдельная локальная БД):

```bash
npm run build:client
npx wrangler d1 migrations apply campus-smoke-db --local --config wrangler.smoke.jsonc
npx wrangler dev --local --config wrangler.smoke.jsonc --port 8791
```

Проверить `http://127.0.0.1:8791/health`, `/api/processing` и `/api/schedule/day?date=2026-09-03`. На пустой очереди запуск завершается без AI-вызова; это проверка HTTP/БД, не модели.

```bash
npm test
npm run lint
npm run build
```

## Legacy Node.js backend (справочно)

Ниже описан прежний Express/SQLite backend из `server/`, а не текущий Worker. Его отдельная команда — `npm run dev:legacy-server`. Его `.env`, локальные ключи и webhook URL не являются конфигурацией Cloudflare Worker.

## Запуск

```bash
npm install
cp .env.example .env
npm run dev
```

Frontend запускается через Vite, backend — на `http://127.0.0.1:8787`. Vite проксирует `/api` на backend.

Для production-сборки:

```bash
npm run build
npm start
```

## Telegram Bot API

Интеграция использует webhook, а не polling.

1. Создайте публичный HTTPS-адрес backend (production domain или tunnel).
2. Укажите его без завершающего `/`:

```env
TELEGRAM_WEBHOOK_BASE_URL=https://campus.example.com
```

3. При необходимости задайте постоянный ключ шифрования токена:

```bash
openssl rand -base64 32
```

```env
TELEGRAM_TOKEN_ENCRYPTION_KEY=<base64-key>
```

Если ключ не указан, backend создаёт `.data/telegram-token.key` с правами `0600`. Каталог `.data` и файл `.env` исключены из Git.

4. Откройте **Настройки → Telegram**, введите Bot Token и нажмите **Проверить и подключить**.
5. Добавьте бота в группу. Чтобы бот видел все сообщения, отключите Privacy Mode через BotFather или назначьте бота администратором.
6. После первого webhook-сообщения группа появится в разделе **Найденные группы**.

Bot Token отправляется только в backend endpoint, шифруется AES-256-GCM и не попадает в frontend bundle, `localStorage` или ответы API.

### Backend endpoints

- `GET /api/integrations/telegram` — безопасное состояние интеграции;
- `POST /api/integrations/telegram/connect` — проверка токена и регистрация webhook;
- `POST /api/integrations/telegram/test` — `getMe` + `getWebhookInfo`;
- `PATCH /api/integrations/telegram/groups/:chatId` — выбор группы;
- `DELETE /api/integrations/telegram` — удаление webhook и серверного токена;
- `POST /api/webhooks/telegram/:secret` — входящие Telegram updates.

Webhook проверяет секрет одновременно в URL и заголовке `X-Telegram-Bot-Api-Secret-Token`.

### Хранилище

SQLite находится в `.data/campus.sqlite`. Для каждого группового сообщения backend сохраняет:

- `external_message_id`;
- `chat_id`;
- `chat_name`;
- `sender`;
- `text`;
- `sent_at`;
- `reply_to`;
- `message_type`;
- `attachment_reference`;
- `processed_at`.

Повторная доставка одного сообщения безопасна: запись дедуплицируется по `chat_id + external_message_id`.

## WhatsApp Bridge

Обычные группы личного WhatsApp-аккаунта нельзя читать через официальный WhatsApp Cloud API. Для этого сценария Campus использует отдельный WhatsApp Bridge, работающий вне Cloudflare Worker и подключающийся как связанное устройство.

Текущая реализация содержит mock bridge для разработки интерфейса и API-контракта. Он создаёт pairing QR, имитирует подключение и возвращает тестовый список групп. Реальный bridge должен реализовать тот же контракт и работать как отдельный процесс или сервис.

Настройте общий секрет между bridge и Campus backend:

```env
WHATSAPP_BRIDGE_SECRET=<long-random-secret>
```

Если значение отсутствует, локальный backend создаёт `.data/whatsapp-bridge.key` с правами `0600`.

### Backend endpoints

- `GET /api/integrations/whatsapp` — статус, QR и доступные группы;
- `POST /api/integrations/whatsapp/connect` — запрос pairing QR у bridge;
- `PUT /api/integrations/whatsapp/groups/:groupId` — выбор единственной разрешённой группы;
- `DELETE /api/integrations/whatsapp` — отключение;
- `POST /api/bridges/whatsapp/messages` — приём нормализованного группового сообщения от bridge.

Последний endpoint требует заголовок `X-WhatsApp-Bridge-Secret`. Личные сообщения и сообщения невыбранных групп отклоняются до записи в хранилище.

Telegram и WhatsApp реализуют общий интерфейс `MessageSource` и приводят входящие события к одной структуре `IncomingSourceMessage` с полями источника, внешнего ID, группы, отправителя, текста, времени, reply context, типа сообщения, вложения и времени обработки.

## Проверка

```bash
npm test
npm run lint
npm run build
```
