# Grades and guided practice

Grade cards show a main circular score and individual circles for the source's midterms, current averages, rating, exam or practice. Missing and zero values remain distinct. Actual Platonus academic-year/semester options are retained; no course number is inferred from list position. A small calculator button beside the period controls opens a focused dialog with Escape dismissal.

The ten-step introduction uses the actual AssistantPage renderer with a scripted draft and replies, and an isolated in-memory Wednesday schedule. It demonstrates day/week switching, manual room editing and adding a class, accelerated live progress, the existing TeacherLink profile viewer, cancellation, a new class, homework, and reversing the three scripted changes. Delay before each schedule mutation makes the before/after visible. Pause, replay, back, close, reduced-motion support and language controls are included. Navigating elsewhere exits the introduction. No demo action IDs or changes are sent to the backend; closing/reloading discards all practice state.

The course-material step is a simple preview. The teacher link uses an actual catalog entry when available; empty catalogs get an explanation. Profile and photo content remain dependent on what the university publishes. The three-change undo conversation is explicitly scripted practice, not a new backend bulk-undo endpoint.

Validation: client build and all 38 frontend tests pass. Browser smoke covers day/week, room editing, adding a practice class, progress, typed chat/reply, pause/resume, cancellation before/after, add/homework/undo, 320px long-name layout, and calculator Escape. It asserts zero non-GET API requests throughout the full tutorial. Mobile screenshots were inspected and circle shrink/input clipping were corrected. The tutorial and AI modules remain lazy-loaded.

Published to campus-planner.mymemory9.workers.dev, version 5efd7761-fd3c-4cc7-bc09-72a463cf1460. Calculator trigger is above the grade list, next to period controls.
