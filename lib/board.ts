// Pure board-state operations: create / edit / delete / seed.
//
// Every operation returns a new array and never mutates its inputs, so a
// caller can always reconstruct the previous state (the drag system relies on
// this for transactional restore). Content is validated at this layer so the
// invariants hold no matter which UI calls in.

import type { UniqueIdentifier } from "@dnd-kit/core";

export const BOARD_COLUMN_IDS = ["todo", "in-progress", "done"] as const;

export type BoardColumnId = (typeof BOARD_COLUMN_IDS)[number];

export interface Task {
  /** Stable unique id, generated once at creation and never reused. */
  id: UniqueIdentifier;
  columnId: BoardColumnId;
  content: string;
}

/** Maximum characters a single task's content may hold. Documented in README. */
export const MAX_TASK_CONTENT_LENGTH = 200;

/** Upper bound on tasks per board; also the bound applied to imports. */
export const MAX_TASK_COUNT = 300;

export type TaskContentErrorCode = "empty" | "too-long";

export function validateTaskContent(content: string): TaskContentErrorCode | null {
  if (content.trim().length === 0) return "empty";
  if (content.length > MAX_TASK_CONTENT_LENGTH) return "too-long";
  return null;
}

export class TaskContentError extends Error {
  readonly code: TaskContentErrorCode;

  constructor(code: TaskContentErrorCode) {
    super(
      code === "empty"
        ? "Task content cannot be empty."
        : `Task content is limited to ${MAX_TASK_CONTENT_LENGTH} characters.`
    );
    this.name = "TaskContentError";
    this.code = code;
  }
}

export class TaskLimitError extends Error {
  constructor() {
    super(`A board can hold at most ${MAX_TASK_COUNT} tasks.`);
    this.name = "TaskLimitError";
  }
}

/** Generates a stable unique id for a new task. Called once per creation. */
export function createTaskId(): UniqueIdentifier {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `task-${crypto.randomUUID()}`;
  }
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Appends one new task to a column. Exactly one task is added; inputs are untouched. */
export function createTask(
  tasks: Task[],
  columnId: BoardColumnId,
  content: string,
  id: UniqueIdentifier = createTaskId()
): Task[] {
  if (tasks.length >= MAX_TASK_COUNT) {
    throw new TaskLimitError();
  }
  const code = validateTaskContent(content);
  if (code) throw new TaskContentError(code);
  return [...tasks, { id, columnId, content }];
}

/** Rewrites one task's content. Identity (id and column) is preserved; other tasks are untouched. */
export function editTask(tasks: Task[], taskId: UniqueIdentifier, content: string): Task[] {
  const code = validateTaskContent(content);
  if (code) throw new TaskContentError(code);
  return tasks.map((task) => (task.id === taskId ? { ...task, content } : task));
}

/** Removes exactly the named task; other tasks are untouched. */
export function deleteTask(tasks: Task[], taskId: UniqueIdentifier): Task[] {
  return tasks.filter((task) => task.id !== taskId);
}

/** Reset always produces an empty board (explicit decision, documented in README). */
export function emptyBoard(): Task[] {
  return [];
}

/**
 * Sample-data decision: the thirteen historical sample tasks are seeded only
 * when the board has no tasks at all (first run with empty storage once
 * persistence lands). A non-empty board is never reseeded.
 */
export const SEED_TASKS: Task[] = [
  { id: "task1", columnId: "done", content: "Project initiation and planning" },
  { id: "task2", columnId: "done", content: "Gather requirements from stakeholders" },
  { id: "task3", columnId: "done", content: "Create wireframes and mockups" },
  { id: "task4", columnId: "in-progress", content: "Develop homepage layout" },
  { id: "task5", columnId: "in-progress", content: "Design color scheme and typography" },
  { id: "task6", columnId: "todo", content: "Implement user authentication" },
  { id: "task7", columnId: "todo", content: "Build contact us page" },
  { id: "task8", columnId: "todo", content: "Create product catalog" },
  { id: "task9", columnId: "todo", content: "Develop about us page" },
  { id: "task10", columnId: "todo", content: "Optimize website for mobile devices" },
  { id: "task11", columnId: "todo", content: "Integrate payment gateway" },
  { id: "task12", columnId: "todo", content: "Perform testing and bug fixing" },
  { id: "task13", columnId: "todo", content: "Launch website and deploy to server" },
];

export function seedTasksIfEmpty(tasks: Task[]): Task[] {
  return tasks.length === 0 ? SEED_TASKS : tasks;
}
