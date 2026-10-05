# Schedule review, account activity and mobile installation

- The schedule notification opens a dedicated comparison modal, showing Campus and Platonus side by side, including collisions and Campus-only classes. Reading does not dismiss the notice. Applying selected changes or explicitly keeping the current timetable acknowledges the reviewed snapshot; a newer snapshot produces a conflict instead of hiding a new notification. Personal lessons are never deleted by this flow.
- Owner-only administration retains its Telegram elevation requirement and adds cached Platonus profile name, connection/sync/error state, storage usage, visible-tab time, mobile time and last seen. Profile names come from the same `/rest/fio/ru` endpoint used by the university frontend; no credentials or other profile fields are returned. Missing names are backfilled without blocking the list, then refreshed during sync.
- Activity is per authenticated account, capped to a minute per heartbeat and merged across overlapping tabs. Hidden intervals are excluded; the initial observation earns no historical time. The UI reports online for observations within 90 seconds. These are approximate browser-presence metrics, not proof of attention; counting begins with this version.
- After ten accumulated visible minutes, mobile users receive a one-time installation guide. The per-account claim prevents duplicate prompts across devices. Administrators can queue another guide; repeated clicks while pending do not add more prompts. Standalone launches suppress the prompt. No browser permissions are requested automatically.
- Added a web app manifest and PNG icons derived from the existing Campus SVG. The guide uses Chrome's install prompt when offered, otherwise explains Android Chrome / iPhone Safari menu steps. It does not promise offline availability.

Validation: client build and worker typecheck; 41 frontend tests, full worker suite 175 tests before two additional targeted review/profile tests (both passing). Mock browser checks cover mobile comparison, explicit dismissal without schedule writes, one-time installation, admin protection and mobile layout. No real accounts deleted or schedules changed during QA.

Deployment: global D1 migration `0020_account_activity.sql`; private workspace migration `0021_platonus_profile.sql` appended without changing previous migration indices.

Published version: `1a729edf-13a9-4aae-b117-c0f32ea6f6f2`. Web manifest returns HTTP 200. Temporary local preview stopped.
Production browser verification: the owner's real schedule notification opens the new comparison with six differences and three Campus-only lessons. Both apply/keep actions are visible; neither was submitted during verification.

Installation guidance references:
- https://support.google.com/chromebook/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en
- https://support.apple.com/en-tm/guide/iphone/iphea86e5236/ios
