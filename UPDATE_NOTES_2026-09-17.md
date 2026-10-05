# Campus — 17 September 2026

## Shipped
- UMKD: all illustrated document category cards remain together on one screen, with a full filename tooltip. Only the opened PDF uses previous/next page controls. Illustrations are local SVG icons, independent of Platonus availability.
- Relative dates: weekday plus “через две недели” now uses the indicated future week. Unsupported or contradictory relative qualifiers cannot silently become the nearest weekday. Regression: 17 September + Friday in two weeks resolves to 2 October, not 18 September.
- Schedule: desktop-style horizontal weekly grid on mobile; regular lesson deletion through editor and direct assistant command; deleted lesson list with restoration and collision checks. Date-specific omission uses cancellation, not deletion of the recurring series.
- Tutorials: section-specific entry buttons, per-account completion, settings replay. Mobile coachmark scroll positioning, elapsed/remaining/break display. Fixed broad dark CSS substring selectors that accidentally matched bg-blue-500 when intended for bg-blue-50, rendering filled progress indistinguishable from its track.
- Ordinary accounts no longer see tasks, homework badges, unfinished messenger/people/automation/storage settings. Server blocks experimental routes when production ADMIN_ACCOUNT_ID is configured. Existing data retained. Admin task preview supports manual creation, descriptions, deadlines, state filters, files and image previews; existing AI assignment creation remains available to admin.
- Installation invitation is a small nonblocking banner. Detailed steps open on request and remain available under General settings. Release notes rewritten as concise feature changes.
- Dedicated admin page, existing owner + Telegram one-time code elevation retained. Platonus real name, saved login and group are distinct fields. Group accepted only from university response. New filters/sorting and event journal for sign-ins, page views and document delivery; visible time/device statistics. No arbitrary SQL execution endpoint.
- Events kept 90 days, account-scoped browser events deduplicated and rate-limited. Registration discloses event collection. No passwords, message text, IP history or document contents in analytics. Account removal cascades analytics. Legacy profile backfill is paged, max 30 workspaces/request.
- Shared-IP authentication capacity increased from 30 to 600 attempts/10min; individual login/IP limit remains 10. Activity heartbeat reduced to once/minute to reduce writes.

## Validation
- Worker TypeScript and production frontend build pass.
- 192 worker tests; 41 frontend tests pass.
- Browser mock checks: 390px and 320×640px tutorial, moving and visibly distinct progress, break state, correct spotlight targets, cancellation/addition/undo preview without schedule mutations.
- Mobile UMKD pagination and PDF canvas, feedback dialog, keyboard Escape, 320px overflow checks pass.
- Final UI smoke: 320px horizontally scrollable week, hidden ordinary features, install instructions on demand, persisted section completion, separate locked admin page.
- Local concurrency: 200 simultaneous requests in each of five waves (1,000 requests total), 0 unexpected errors. Register p95 2,604ms, login 1,335ms, schedule 111ms, assistant deterministic clarification 134ms, history 69ms. All 200 use the same simulated campus IP. Histories remain isolated.
- This is NOT a production bandwidth or real model inference load test. No 200-call burst was sent to Gemma or Platonus. Cloudflare inference quotas and free-plan daily limits remain relevant. No claim of unlimited free capacity.

## Migrations and limits
- Global D1: 0023_admin_analytics.sql applied explicitly. Do not run all private workspace migrations against the account registry.
- Private workspace append-only migrations: 0022_schedule_removals.sql, 0024_platonus_group.sql, applied by Durable Object initialization.
- Group field stays blank if Platonus does not provide it; do not infer from login.
- No retroactive page/download telemetry; counting starts with this release.
- Admin task list currently shows latest 100 tasks. AI creates text assignments; documents are attached from the task card, not interpreted by a vision model.
- Authentication/load test is an emulator benchmark, not a guarantee of production latency. See qa-artifacts/load-200-2026-09-17.log.

Official quota references checked 17 September 2026:
https://developers.cloudflare.com/workers-ai/platform/limits/
https://developers.cloudflare.com/workers-ai/platform/pricing/
https://developers.cloudflare.com/d1/platform/pricing/

Production deployed successfully: a3c85d57-6978-4b47-b5c5-87dbe1a22efc. Health and new asset fingerprint verified; anonymous admin and tutorial requests correctly return 401. Existing authenticated owner schedule loaded successfully after private migrations.
