# Registration and optional Platonus credentials

- Registration now asks only for login and password. Existing display names remain; new accounts default to their login on the server.
- Both Platonus sign-in forms have an unchecked-by-default remember checkbox with explanatory copy. Only an explicit `remember:true` stores encrypted login/password, including during verification and retryable login failures. The preference is not forwarded to Platonus.
- Signing in without remembering clears any prior saved credentials and performs one initial sync. Scheduled sync and subsequent explicit refresh routes require saved credentials or a fresh login. Grades/UMKD refresh buttons lead to settings when credentials are not saved.
- The one-time session supports the initial archive download; it is cleared on queue completion and ceases to be usable after 15 minutes from collection on the next access. No one-time login/password is saved. Previously downloaded study data is retained. One-time failures do not queue credential-based retries.
- Password inputs clear after both successful and failed attempts. New explanatory copy is available in Russian, English and Kazakh.

Validation: production client build, worker typecheck, full worker suite (180 tests); targeted sync/archive/journal tests after the session lifetime change (28 tests), plus explicit refresh-guard tests. Mock mobile-browser regression checked registration fields and both checkbox modes. No real credentials or accounts were changed during QA. No schema migration required.
