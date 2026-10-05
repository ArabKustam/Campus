# Campus: live schedule, UMKD and feedback

Deployed version: `69dc2900-4530-4099-b900-fc3bad435933`.

- Between today's classes, highlight the next eligible lesson and show minutes until start in day/week views. Cancelled, moved-away and other-subgroup lessons are excluded.
- Standard 105-minute pairs show first 50 minutes, a 5-minute break, then second 50 minutes. Custom-duration sessions retain their existing progress display.
- UMKD subject selection and PDF preview use a modal; mobile view fills the screen with a visible close/back action and keyboard focus handling.
- Sidebar contains notifications and bug/suggestion buttons. Release notes include concrete examples; developer replies include the original report. Replies are account-scoped and paginated, and unseen replies show a bell indicator.
- Feedback is stored in account D1 before Telegram delivery. Failed sends stay queued for the scheduled retry. Limit: five reports per account per hour.
- Telegram webhook requires its own secret, only accepts the linked developer's private chat, maps replies to bot message IDs and deduplicates updates. Initial developer linking requires the private setup link supplied in the conversation. No bot credentials are included in frontend files.

Database: applied `migrations/0017_feedback.sql` directly to `campus-accounts`. Server secrets configured via Wrangler: SUPPORT_BOT_TOKEN, SUPPORT_WEBHOOK_SECRET, SUPPORT_SETUP_KEY. Developer must press Start using their setup link to finish delivery setup; bot registration alone does not identify the recipient.

Validation: client production build and worker typecheck pass; 41 frontend tests and 168 worker tests pass. Extended Telegram failure/retry test passes. `bridge/support-umkd-ui-smoke.ts` verifies UMKD preview, notifications, feedback and keyboard closing at 320px using mocked APIs. Production sidebar and notifications checked through the authenticated browser. Local preview stopped after verification.
