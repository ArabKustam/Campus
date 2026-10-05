# Personal accounts, study archive, Gemma 4 and administration

Implemented:
- Account registration, login and password changes accept passwords of 4–256 characters. Existing password hashing, login throttling and sessions are preserved.
- Saved journals and their year/term selectors return immediately without an upstream freshness check. Background jobs refresh all available study periods.
- Each user's isolated workspace stores UMKD catalogs and PDFs in private chunked storage. A persistent queue downloads documents before they are opened, retries failures, preserves successful copies and retains previously published courses/documents. The browser shows which files have actually been saved. An unavailable university cannot supply a file that has never been downloaded; failed initial downloads remain pending.
- Study archive alarms coexist with the existing Platonus login/sync retry alarm. Files remain subject to the existing 20 MiB individual limit and workspace storage guard. No R2 subscription or VPS was added.
- Tutorial timer loops at five simulated minutes per second, displays elapsed/remaining time plus the 50+5+50 break, and highlights the entire timer. Pause/resume remains available throughout the timer step.
- Production Workers AI model changed to `@cf/google/gemma-4-26b-a4b-it`. Added OpenAI-style response/schema handling and disabled thinking for predictable action extraction. Live synthetic probes verified subject extraction and ADD_HOMEWORK against the full action schema without changing any user's schedule.
- The deterministic recurring command parser removes command prefixes and recognizes the user's exact cultural-studies example, preserving the copied teacher/room and denominator week.
- Settings has an owner-only Administration entry. Eligibility comes from the server secret ADMIN_ACCOUNT_ID, never a client role or supplied account ID. Telegram codes expire after five minutes, allow five verification attempts, are single-use and rate-limited. Elevated sessions last ten minutes and bind to the original authenticated session. Account deletion requires the exact target login, prevents self-deletion, revokes access, removes workspace data and records an audit event. No actual user accounts were deleted during QA.

Production schema: `0019_admin.sql` applied to campus-accounts. Private workspace migration `0018_study_archive.sql` appended to the existing migration list; previous migration ordering unchanged. ADMIN_ACCOUNT_ID configured as a server secret for the existing owner account. No credentials in frontend assets.

Validation: production client build and worker typecheck; frontend suite 41 tests; worker suite 173 tests at its full run, with additional targeted archive/administration tests passing afterward. Local mock-browser checks passed for mobile admin verification/deletion confirmation, the complete tutorial, accelerated clock and break spotlight. Production checked for normal schedule, protected admin entry, UMKD archive kickoff and saved-document labels. Replaced the blank native iframe preview with a lazy PDF.js viewer (page navigation, zoom and accessible page text). Verified mobile rendering locally and the actual 65-page cultural-studies PDF on production; the owner's archive contains 20 saved documents. Production dependencies audit reports zero vulnerabilities. Local preview/probe servers stopped.

Published version: `04c57db3-18a4-4b95-b084-40a5db90581a` at https://campus-planner.mymemory9.workers.dev/.

Model references:
- https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/ (Gemma 4 remains available on Workers Free)
- https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/ (thinking control and response shape)
