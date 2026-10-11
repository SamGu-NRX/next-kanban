# Review summary mirror: PR #1, next-kanban board

This file mirrors the workspace review summary (artifact `art_bFipkgI6`) published in the Obvious workspace `prj_iHPwGSSr`. The workspace retired ~2026-10-11 07:20Z; this mirror is the durable copy for the successor workspace. Human review of this draft PR was requested but could not outlive the workspace: re-request review in the successor workspace before merging anything.

**PR:** https://github.com/SamGu-NRX/next-kanban/pull/1 (draft, open, never merged)
**Branch:** `obv/products-l4-kanban-finished-board-20261010` → `main` (base `bd95ccb`)

## Milestones (verified on origin refs)

- **d8f5f4f — M1 witnesses.** Failing cancel-restore and SSR-window tests reproducing the defects, plus baseline receipts (tsc TS2322 on ThemeProviderProps, build failure, dev-server SSR crash) committed under `docs/receipts/`.
- **467c1e3 — M2 SSR fix + task CRUD.** ThemeProvider honors `attribute`/`enableSystem`/`disableTransitionOnChange`; DragOverlay portal gated behind mounted state so the route prerenders statically. Create/edit/delete with stable create-time ids, 200-char max, 300-task bound, per-column empty states, first-run-only sample seed, two-click reset.
- **f2b475d — M3 transactional drag.** Pre-drag snapshot; commit only in `onDragEnd`; `onDragCancel` restores exactly (Escape and dropped-outside); immutable task copies instead of in-place mutation; dnd-kit keyboard preset and announcements preserved. Cancellation test transcripts and a keyboard walkthrough receipt committed.
- **853e8d0 — M4 persistence + evidence.** Versioned validated schema (`next-kanban-board-v1`; bounds: 300 tasks, 200 chars, 512 KiB), visible non-blocking notices for unavailable/full/corrupted storage, cross-tab conflict hold-back, JSON export/import. Playwright evidence at 1440x900 and 390x844 with committed screenshots, zero hydration layout shift, keyboard pass, prefers-reduced-motion pass, axe zero serious/critical at both viewports. Receipt: `docs/receipts/m4-persistence-evidence.md`.

## Verification (lead agent, independent fresh checkout of the pushed head)

- `CI=true pnpm install --frozen-lockfile`: exit 0 (pnpm 10; matches lockfile v9.0)
- `pnpm exec vitest run`: 38/38 pass, exit 0
- `pnpm exec tsc --noEmit`: exit 0
- `pnpm lint`: exit 0, 0 errors (4 pre-existing react-refresh warnings)
- `pnpm build`: exit 0; route `/` prerendered as static content
- Baseline on `main` before the branch (same sandbox): `tsc --noEmit` exit 2 (`attribute` missing on `ThemeProviderProps`), `next build` exit 1 on the same type error, dev-server SSR crash on `window` — exact outputs committed as receipts.
- Authorship: all milestone commits authored `Sam Gu <127461594+SamGu-NRX@users.noreply.github.com>` with the `Co-authored-by: obvious-autobuild[bot]` trailer, checked on origin refs. No workflow, deployment, or repository-settings changes; nothing merged; draft only.

## Deferred / honest limits

- Real Safari and real phone touch were not run (Playwright Chromium on Linux only); the PR states this.
- The axe scans cover the board route at the two tested viewports, not other pages.
- The repo has no CI (no `.github` directory); lint/build evidence is local with receipts committed.
- The PR remains draft for human review per project policy.

## Decisions

1. No Obvious GitHub App or repo sandbox existed in the workspace: pushes used the workspace token with Sam Gu as sole commit author and the obvious-autobuild co-author trailer.
2. pnpm pinned to 10.18.3 via corepack: the lockfile is v9.0 and pnpm 12 hard-fails the sharp build-script gate.
3. Sample tasks seed only the first run; reset produces an empty board.
4. Storage unavailable/full/corrupted states surface visible non-blocking notices and never silently wipe; cross-tab conflicts hold back instead of overwriting dirty local work.
5. The theme provider was extended to honor `attribute`/`enableSystem`/`disableTransitionOnChange` rather than trimming the layout props.
6. Real Safari and phone-touch checks were deferred rather than substituted with unverifiable claims; everything else is receipt-backed.
