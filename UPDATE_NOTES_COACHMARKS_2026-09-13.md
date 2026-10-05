# Guided tooltips and grade calculator

The calculator now asks for a subject, prefills only its published Platonus Rating field, and asks for a desired final grade. It forecasts the exam score under an explicitly editable 60/40 example formula. Missing ratings stay blank and real zero ratings remain zero. Subjects without an exam are identified; aggregate totals and assignment counts are not guessed. Forecast edits never change source grades.

Tutorial instructions moved from the page header into floating cards positioned beside the active control, with a bright outlined spotlight, dimmed surroundings and an SVG arrow. Position updates follow scrolling, resizing and lazy page rendering. Chat spotlight moves from draft to the current message. The accelerated class clock advances one simulated minute every 200 ms, five times the previous demo rate.

Teacher preview is entirely fictional with a local SVG portrait and example biography/consultation times. It does not fetch catalog entries, university search results, or profile data. Real teacher lookup outside the tutorial is unchanged.

Validation: build and 39 frontend tests passed, including rating-only autofill, zero/missing values, and forecast arithmetic. Browser tests verify mobile coachmark placement, editable room, fivefold clock speed, fictional profile image, 80-point rating autofill producing a 67.5-point exam requirement for a target of 75, calculator Escape, and no backend mutations. Final production-build walkthrough recheck performed before deployment.

2026-09-14: confirmed production deployment bdcdcfe5-bf8e-431e-a036-0ba0a5e96ef8 at 100% traffic. Campus loads successfully in the authenticated browser. Both production-build browser smoke suites passed before publication.

2026-09-14 follow-up: fixed stale/wrong tutorial spotlights. Cancellation targets the physics card, adding a class targets the third free slot, homework targets its own area, and bulk undo targets a three-change status card. Coachmarks clear while a target is absent and remeasure during transitions. The full browser walkthrough verifies that every spotlight geometrically matches its intended target. Published as version 953de7e8-ba2a-4278-ae16-efd8b73fb9c9.
