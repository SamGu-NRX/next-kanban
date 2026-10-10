// UI-level CRUD: create, edit, delete, validation, and empty states, driven
// through the rendered board the way a user would.
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { KanbanBoard } from "@/components/KanbanBoard";

afterEach(cleanup);

const COLUMN_TITLES = ["Todo", "In progress", "Done"] as const;
type BoardView = Record<(typeof COLUMN_TITLES)[number], string[]>;

function columnCard(title: string): HTMLElement {
  const header = screen.getByText(title, { selector: "span" });
  const grip = within(header.parentElement as HTMLElement).getByRole("button", {
    name: new RegExp(`move column: ${title}`, "i"),
  });
  return grip.parentElement?.parentElement as HTMLElement;
}

function taskCardRoots(): HTMLElement[] {
  return screen
    .queryAllByRole("button", { name: /move task/i })
    .map((btn) => btn.parentElement?.parentElement)
    .filter((el): el is HTMLElement => el instanceof HTMLElement);
}

function taskCardsIn(column: HTMLElement): HTMLElement[] {
  return taskCardRoots().filter((card) => column.contains(card));
}

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

it("creates a task in the intended column", async () => {
  render(<KanbanBoard />);
  expect(boardView()).toEqual(INITIAL_VIEW);

  const todo = columnCard("Todo");
  fireEvent.click(within(todo).getByRole("button", { name: /add task/i }));
  const input = within(todo).getByRole("textbox", {
    name: "New task content for Todo",
  });
  fireEvent.change(input, { target: { value: "Ship the release notes" } });
  fireEvent.submit(input.closest("form") as HTMLFormElement);

  expect(boardView()).toEqual({
    ...INITIAL_VIEW,
    Todo: [...INITIAL_VIEW.Todo, "Ship the release notes"],
  });
});

it("rejects empty content with a visible message", () => {
  render(<KanbanBoard />);
  const todo = columnCard("Todo");
  fireEvent.click(within(todo).getByRole("button", { name: /add task/i }));
  const input = within(todo).getByRole("textbox", {
    name: "New task content for Todo",
  });
  fireEvent.change(input, { target: { value: "   " } });
  fireEvent.submit(input.closest("form") as HTMLFormElement);

  expect(screen.getByRole("alert").textContent).toMatch(/cannot be empty/i);
  // No task was added.
  expect(boardView()).toEqual(INITIAL_VIEW);
});

it("edits exactly one task's content", () => {
  render(<KanbanBoard />);
  const todo = columnCard("Todo");
  const card = taskCardsIn(todo).find((c) =>
    c.textContent?.includes("Build contact us page")
  ) as HTMLElement;
  fireEvent.click(within(card).getByRole("button", { name: /edit task/i }));

  const input = within(card).getByRole("textbox", { name: /edit task/i });
  fireEvent.change(input, { target: { value: "Build contact page with form" } });
  fireEvent.click(within(card).getByRole("button", { name: /save/i }));

  expect(boardView()).toEqual({
    ...INITIAL_VIEW,
    Todo: [
      "Implement user authentication",
      "Build contact page with form",
      ...INITIAL_VIEW.Todo.slice(2),
    ],
  });
});

it("deletes exactly one task", () => {
  render(<KanbanBoard />);
  const todo = columnCard("Todo");
  const card = taskCardsIn(todo).find((c) =>
    c.textContent?.includes("Build contact us page")
  ) as HTMLElement;
  fireEvent.click(within(card).getByRole("button", { name: /delete task/i }));

  const { Todo, ...rest } = INITIAL_VIEW;
  expect(boardView()).toEqual({
    ...rest,
    Todo: INITIAL_VIEW.Todo.filter((c) => c !== "Build contact us page"),
  });
});

it("shows per-column empty states and an empty-board call to action after reset", () => {
  render(<KanbanBoard />);
  // Two-step reset: arm, then confirm.
  const reset = screen.getByRole("button", { name: /reset board to empty/i });
  fireEvent.click(reset);
  fireEvent.click(screen.getByRole("button", { name: /confirm board reset/i }));

  expect(boardView()).toEqual({ Todo: [], "In progress": [], Done: [] });
  expect(screen.getByText(/your board is empty/i)).toBeTruthy();
  expect(screen.getByRole("button", { name: /create your first task/i })).toBeTruthy();
  for (const title of COLUMN_TITLES) {
    const col = columnCard(title);
    expect(col.textContent).toMatch(/no tasks here yet/i);
    // Every column still offers a way to add a task.
    expect(within(col).getAllByRole("button", { name: /add task/i }).length).toBeGreaterThan(0);
  }

  // The empty-board CTA opens the first column's add form.
  fireEvent.click(screen.getByRole("button", { name: /create your first task/i }));
  const todo = columnCard("Todo");
  expect(
    within(todo).getByRole("textbox", { name: "New task content for Todo" })
  ).toBeTruthy();
});
