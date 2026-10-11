// WITNESS (expected red until milestone 3): cancelling a drag with Escape must
// restore the pre-drag task and column state exactly. Today onDragOver commits
// task moves into state immediately and DndContext has no onDragCancel handler,
// so an Escape leaves the task in the intermediate column it was dragged over.
//
// The test drives the real dnd-kit KeyboardSensor: Space picks the task up,
// ArrowRight moves it over the next column, Escape cancels. jsdom has no
// layout, so deterministic geometry is provided by stubbing
// getBoundingClientRect: column and task cards get a registered layout, and
// the drag overlay (which mounts outside the board container) inherits the
// dragged task's original rect, mirroring real-browser behavior.
import { afterEach, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { KanbanBoard } from "@/components/KanbanBoard";

const COLUMN_TITLES = ["Todo", "In progress", "Done"] as const;
type BoardView = Record<(typeof COLUMN_TITLES)[number], string[]>;

const COLUMN_X = [0, 360, 720];
const COLUMN_WIDTH = 350;
const COLUMN_HEIGHT = 500;
const TASK_HEIGHT = 120;
const TASK_GAP = 10;
const DRAGGED_TASK = "Build contact us page";

type Rect = ReturnType<typeof rect>;
function rect(x: number, y: number, w: number, h: number) {
  return {
    x, y, top: y, left: x, right: x + w, bottom: y + h, width: w, height: h,
    toJSON() { return this; },
  };
}

const realGetBCR = HTMLElement.prototype.getBoundingClientRect;
const rectByElement = new WeakMap<HTMLElement, Rect>();

function stubRect(el: HTMLElement, r: Rect) {
  rectByElement.set(el, r);
}

/**
 * Deterministic layout: cards inside the board container use the registered
 * rects; the drag overlay mounts as a direct child of <body> (outside the
 * rendered container) and reports the dragged task's original rect, which is
 * what a real browser reports for the overlay at drag start.
 */
function installGeometryStub(boardContainer: HTMLElement, draggedOriginalRect: Rect) {
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const registered = rectByElement.get(this);
    if (registered) return registered;
    if (!boardContainer.contains(this) && this.textContent?.includes(DRAGGED_TASK)) {
      return draggedOriginalRect;
    }
    return realGetBCR.call(this);
  };
}

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = realGetBCR;
});

function columnCard(title: string): HTMLElement {
  const header = screen.getByText(title, { selector: "span" });
  const grip = within(header.parentElement as HTMLElement).getByRole("button", {
    name: new RegExp(`move column: ${title}`, "i"),
  });
  const card = grip.parentElement?.parentElement;
  if (!card) throw new Error(`column card for ${title} not found`);
  return card as HTMLElement;
}

function taskCardRoots(): HTMLElement[] {
  return screen
    .getAllByRole("button", { name: /move task/i })
    .map((btn) => btn.parentElement?.parentElement)
    .filter((el): el is HTMLElement => el instanceof HTMLElement);
}

function taskCardsIn(column: HTMLElement): HTMLElement[] {
  return taskCardRoots().filter((card) => column.contains(card));
}

/** Task content strings per column, in visual (DOM) order. */
function boardView(): BoardView {
  const view = { Todo: [], "In progress": [], Done: [] } as BoardView;
  for (const title of COLUMN_TITLES) {
    view[title] = taskCardsIn(columnCard(title)).map(
      (card) => (card.querySelector<HTMLElement>(".grow")?.textContent ?? "").trim()
    );
  }
  return view;
}

const INITIAL_VIEW: BoardView = {
  Todo: [
    "Implement user authentication",
    "Build contact us page",
    "Create product catalog",
    "Develop about us page",
    "Optimize website for mobile devices",
    "Integrate payment gateway",
    "Perform testing and bug fixing",
    "Launch website and deploy to server",
  ],
  "In progress": ["Develop homepage layout", "Design color scheme and typography"],
  Done: [
    "Project initiation and planning",
    "Gather requirements from stakeholders",
    "Create wireframes and mockups",
  ],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

it("cancelling a keyboard drag restores prior task and column state", async () => {
  const { container } = render(<KanbanBoard />);
  expect(boardView()).toEqual(INITIAL_VIEW);

  // Register deterministic geometry before the drag starts.
  const draggedIndexInTodo = INITIAL_VIEW.Todo.indexOf(DRAGGED_TASK);
  const draggedOriginalRect = rect(8, 60 + draggedIndexInTodo * (TASK_HEIGHT + TASK_GAP), 334, TASK_HEIGHT);
  for (let c = 0; c < COLUMN_TITLES.length; c++) {
    const col = columnCard(COLUMN_TITLES[c]);
    stubRect(col, rect(COLUMN_X[c], 0, COLUMN_WIDTH, COLUMN_HEIGHT));
    taskCardsIn(col).forEach((taskEl, i) => {
      stubRect(taskEl, rect(COLUMN_X[c] + 8, 60 + i * (TASK_HEIGHT + TASK_GAP), 334, TASK_HEIGHT));
    });
  }
  installGeometryStub(container, draggedOriginalRect);

  // Pick up "Build contact us page" (second task in Todo) with the keyboard.
  const draggedCard = taskCardRoots().find(
    (c) => c.querySelector<HTMLElement>(".grow")?.textContent === DRAGGED_TASK
  );
  if (!draggedCard) throw new Error("dragged task card not found");
  const handle = within(draggedCard).getByRole("button", { name: /move task/i });
  fireEvent.keyDown(handle, { key: " ", code: "Space" });

  // The drag overlay mounts in a body portal once the drag starts.
  await waitFor(() => {
    const overlay = taskCardRoots().find((el) => !container.contains(el));
    expect(overlay).toBeDefined();
  });
  await sleep(50); // KeyboardSensor attaches its document listener in a setTimeout

  // Move it over the next column: onDragOver commits the cross-column move.
  fireEvent.keyDown(document, { key: "ArrowRight", code: "ArrowRight" });
  await waitFor(
    () => {
      expect(boardView()["In progress"]).toContain(DRAGGED_TASK);
    },
    { timeout: 3000 }
  );

  // Cancel: the board must return to the exact pre-drag state.
  fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
  await sleep(50);

  expect(boardView()).toEqual(INITIAL_VIEW);
});
