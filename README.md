# next-react-dnd-kit-tailwind-shadcn-ui Example

This repository provides an example of how to build an accessible Kanban board using the following technologies:

- Next.js 15 App Router
- React
- @dnd-kit
- Tailwind v4
- Shadcn/ui
- pnpm

Built on top of Georgegriff/react-dnd-kit-tailwind-shadcn-ui for a next-js implementation

Demo: https://georgegriff.github.io/react-dnd-kit-tailwind-shadcn-ui/

Developer instructions: [developer guide](/developer.md)

## Board features

Task management works entirely in the browser (no backend):

- **Create** — every column has an "Add task" button. Content must be non-empty and at most 200 characters (enforced in the form and in the state layer, `lib/board.ts`).
- **Edit** — the pencil button on a task opens an inline editor. Editing changes only that task's content; its identity and position are preserved.
- **Delete** — the trash button removes exactly that task.
- **Reset** — "Reset board" requires a second confirming click and produces an empty board.
- **Empty states** — an empty column shows a hint plus the add form; an empty board shows a "Create your first task" call to action.
- **Sample data** — the thirteen historical sample tasks are seeded only on first run when the board has no tasks. They are fully editable and deletable; once removed, they do not come back (reset produces an empty board, not the samples).
- **Persistence** — committed board state is saved to browser storage under the key `next-kanban-board-v1` (versioned, validated schema). Storage failures (unavailable, full, corrupted) surface a visible notice instead of silently wiping data, and concurrent edits from another tab are held back with a conflict notice rather than overwritten. **Export/Import** — the toolbar exports the committed board as a JSON file and imports a previously exported file; imports are validated against the same bounds (max 300 tasks, 200-character contents, 512 KiB payload) and corrupt or oversized files are rejected with a notice. The theme preference is stored separately under `vite-ui-theme`.

