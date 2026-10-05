# Campus groups, onboarding and Platonus refresh

## Delivered

- Primary navigation: schedule, assignments, library, grades, AI assistant, group. Advanced pages are reached from settings. Desktop rail expands on hover/focus and can be pinned; its navigation positions stay stable during expansion. Mobile navigation uses four compact icon buttons.
- New accounts start with empty schedules and onboarding. Existing personal schedules are preserved. Invitation links show the group name after account sign-in and bypass Platonus onboarding when accepted.
- One group per account; multiple named subgroups. Owner, head, subgroup head and member roles; approval of subgroup requests; 7-day revocable invitations; ownership transfer; member removal and owner-confirmed deletion.
- Registry membership and roles are checked at the authenticated gateway on every scoped request. Group/common and individual subgroup workspaces are separate Durable Objects. Grades, university credentials and messenger accounts always remain in personal workspaces.
- Subgroup views include common lessons. A subgroup lesson supersedes a common slot at its conflicting weekday/week type/time. Personal lessons can optionally be overlaid for the current account. Edits use the selected scope; common lessons are edited by selecting common scope.
- Source accounts publish a sanitized schedule-only Platonus snapshot into designated common/subgroup scopes. No grades, UMKD links, login/password or session tokens are copied. Import stays explicit, uses existing preview revision guards and audit/rollback records. Role loss stops further source publishing.
- Group assignments have individual completion state in the registry, without changing other participants' progress.
- Group page contains source selection, preview/import, direct catalogue editor, subgroup and member controls. AI commands run in the selected scope with server-side write authorization.
- Platonus runs hourly (`0 * * * *`). User-entered university credentials are saved encrypted and owner-bound for session renewal; disconnect removes them. Old connections which stored only a session require a new form login before credentials can be retained. Required university verification still needs the user's code.
- Grade and UMKD pages have manual refresh buttons and last-sync timestamps. Connection setup is collapsed when connected; no routine technical tabs are shown there. University availability errors and Campus/network errors have distinct messages; old snapshots survive failures. Schedule differences produce review notices rather than overwriting a timetable.
- UMKD library has course search, per-account browser-local favorites, embedded PDF, download and a separate tab. PDF retrieval still requires university availability; files are not persistently cached offline.

## Schema / deployment

Workspace migration: `migrations/0013_platonus_refresh.sql` (automatically applied by each DO).
Account registry migration: `account-migrations/0002_groups.sql`, applied separately to campus-accounts via Wrangler. Do not apply all domain migrations to production account registry. Includes unique owner-per-group index.

## Verification

Worker suite: 146 passing tests at the full checkpoint; frontend: 28 passing. Additional targeted group/account/Platonus checks also pass. Production build and Worker typecheck pass.
`bridge/groups-cloud-smoke.ts` verified registration, empty onboarding workspace, invitation, shared lesson visibility, member write denial and personal isolation against production. Temporary group and both accounts were deleted successfully (`qa-artifacts/groups-cloud-smoke.json`).

## Known limits / remaining validation

The existing grade parser still cannot interpret the user's KSTU journal format. Hourly/manual requests work, but unsupported grade data is reported explicitly rather than guessed. The user's old university session expired; a repeat login through the site was requested for real-account revalidation and further journal work. No university password was requested in chat.

Subgroup/common histories remain separate views selected by scope. Personal extra lessons are explicitly enabled rather than automatically overlaying old personal timetables. Imported PDF availability is not an offline guarantee. A real academic group's mass adoption and long-running university reconnection have not been load-tested; do not claim unlimited free hosting or full real-account grade support.
