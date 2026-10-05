# Language menu and academic journal

- Language control moved to sidebar above Settings, including mobile navigation. Login, onboarding and tutorial retain compact local controls. Escape closes language choices; labels remain readable by keyboard and screen readers.
- Grades now select actual Platonus academic year and semester, including extra academic period. Selection persists per Campus account.
- Journal parsing supports summary/exam fields, zero marks, HTML blanks, empty semester-two placeholders and missing internal type identifiers.
- Each period has its own cache tied to the encrypted connection revision. Expired sessions renew once; disconnect/reconnect races cannot publish into a changed connection. Failed refresh does not overwrite cached grades.
- Calculator stays available with manual inputs; aggregate ratings are not treated as individual assignment marks.

Validation: complete worker suite 165 tests and frontend suite 36 tests passed before the last parser edge-case addition. Final focused Platonus suites: 19 tests passed; worker typecheck and client build passed. Mocked browser smoke passed at 320/390 px and desktop: year selection, zero display, long Kazakh names, mobile sidebar language, English, Escape. Production verified current semester and 2025–2026 first semester. Production also verified 2025–2026 second semester after fixing empty exam placeholders, including practice marks. Final deployed version: d79c1907-7965-47d8-99b7-3c989349009e.
