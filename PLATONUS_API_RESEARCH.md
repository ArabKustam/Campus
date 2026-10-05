# Platonus API research

Reference: https://github.com/ZhymabekRoman/platonus-api-wrapper (AGPL-3.0, abandoned).
The Python library was inspected as a protocol reference; it is not bundled or installed. Campus's TypeScript client is an independent implementation using observed HTTP contracts, existing Campus encryption and account isolation. No Python source copied.

KSTU public frontend examined 2026-09-11:
- /jscripts/login.js: POST /rest/api/login, /rest/api/verifyCode; login_status, auth_token, sid, challengeId.
- /v7/9940.8e1244e9fa8ec99a.js: student initial/calculate schedule endpoints, viewer fields, lesson time/subject/type/teacher/room fields.
- /v7/9588.345f217727b1df16.js: /rest/umkd/studentRecords/{studyYear}/{term}/ru, records[].subjectName/credits/tutorName/umkdID.
- Wrapper base/study_room/api.py: /rest/api/journal/{year}/{term}/ru. Response shape remains unverified against an authenticated KSTU account; parser rejects unrecognized grades instead of inventing values.

Security boundaries: fixed HTTPS university origin, no arbitrary URLs, no forwarding redirects, owner-bound encrypted sessions, no stored password, bounded response size/time, limited login attempts, revision guards against publishing a disconnected session's sync. Existing preview/import/rollback workflow retained; background sync obtains snapshots and never overwrites manually edited classes automatically.

Cloud verification (2026-09-11): production Worker successfully fetched /rest/api/authType and received HTTP 400 from /rest/api/login using an intentionally nonexistent randomized login. This verifies cloud connectivity, not successful student authentication. Temporary Campus test account was deleted. Transport errors, timeouts, redirects and rejected credentials now have distinct messages. Verification challenges retain encrypted session cookies for the code request.

Pending real-account validation: user must sign in through the Campus form. Authenticated schedule, journal and UMKD responses have not yet been verified end to end against the user's account; unit fixtures are based on public frontend contracts. No real Platonus password has been requested in chat or stored by this implementation.

2026-09-11 authenticated follow-up: login and API schedule retrieval succeeded, but snapshot validation rejected lesson slotNumber > 10. KSTU lessonHours.number is an internal slot ID; lessonHours.displayNumber is the displayed pair number (confirmed against public KSTU UI source). Client now joins cells by number and imports displayNumber. Regression test covers an internal ID of 1201 mapping to pair 2, retaining exact start/end times.

Production validation after fix (version 9611e7c2-7c77-4d51-a460-042544cbf356): refreshed through the user's Campus UI. Snapshot successfully displayed weeks 2 and 3, semester 2026-09-01 to 2026-12-12, lesson types/teachers/rooms and UMKD table with course links. No import buttons were clicked; existing timetable unchanged. Grade journal returned data but its schema remains unsupported, shown as a section-specific error. Cloud integration tests: 8 passed; import/rollback tests: 7 passed.

## Journal contract verified 2026-09-13

Authenticated KSTU responses were inspected via the user's saved Campus connection (no browser token extraction). `/rest/mobile/student/studyYears/ru` returns `studyYearList` and `defaultYear/defaultTerm`; `/rest/mobile/tutor/terms/ru` returns semester options including additional period ID 0. Actual available years must drive the UI; these are academic years, not inferred course numbers.

`/rest/api/journal/{year}/{term}/ru` returns an array with `subjectID`, `subjectName`, `tutorList`, `centerMark`, `totalMark`, and `exams[{name,mark,markTypeId}]`. Semester 2 may include empty exam objects and omit markTypeId. Empty HTML space values normalize to empty; zero remains zero. Aggregates are displayed with source labels and never fed into equal-weight assignment calculations. Records endpoint is not used by this summary view.

Per-period caches reside in the user's Workspace, tagged with Platonus connection revision. Failed refresh keeps the matching period's cached data. Cache freshness is one hour; opening an older cache or pressing refresh fetches that selected period. This does not modify the schedule or UMKD. The temporary schema inspection route and query-only UI were removed.
