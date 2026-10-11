
## A. Load/hydration layout shift and screenshots

- [x] 1440x900: element rects stable across hydration — max column rect delta 0px, first card delta 0px
- [x] 390x844: element rects stable across hydration — max column rect delta 0px, first card delta 0px

## B. create -> edit -> move (keyboard) -> reload -> delete -> reload

- [x] create: task appears in Todo
- [x] edit: content changed, id preserved (same card edited in place)
- [x] keyboard move: task committed to In progress
- [x] reload: moved+edited task persisted
- [x] delete + reload: task stays deleted

## C. reset -> reload stays empty

- [x] reset: board empties and stays empty after reload (no re-seed)

## D. storage blocked: visible notice, board stays usable

- [x] blocked storage shows a visible notice on load
- [x] board stays usable while storage is blocked

## E. import: corrupted rejected, valid applied

- [x] corrupted import shows a rejection notice
- [x] valid import replaces the board
- [x] imported board persists across reload

## F. reduced-motion pass

- [x] create and delete work with prefers-reduced-motion

## G. axe scans (zero serious/critical required)

- [x] axe 1440x900: zero serious/critical violations — 39 rule groups passed
- [x] axe 390x844: zero serious/critical violations — 39 rule groups passed

## Result

PASS — all checks above passed against the served production build.
