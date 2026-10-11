// @vitest-environment node
// Deterministic state tests for the pure board operations. Each test touches
// only the intended task and asserts exactly one task changed.
import { describe, expect, it } from "vitest";
import {
  createTask,
  createTaskId,
  deleteTask,
  editTask,
  emptyBoard,
  seedTasksIfEmpty,
  SEED_TASKS,
  validateTaskContent,
  MAX_TASK_CONTENT_LENGTH,
  TaskContentError,
  TaskLimitError,
  type Task,
} from "@/lib/board";

/** Snapshot of ids + columnIds + contents, in order. */
function snapshot(tasks: Task[]) {
  return tasks.map((t) => `${t.id}::${t.columnId}::${t.content}`);
}

describe("createTask", () => {
  it("adds exactly one task to the intended column", () => {
    const before = snapshot(SEED_TASKS);
    const next = createTask(SEED_TASKS, "in-progress", "Write the launch post");

    expect(next).toHaveLength(SEED_TASKS.length + 1);
    // Every pre-existing task is untouched, in the same order.
    expect(snapshot(next.slice(0, SEED_TASKS.length))).toEqual(before);
    const added = next[next.length - 1];
    expect(added.columnId).toBe("in-progress");
    expect(added.content).toBe("Write the launch post");
  });

  it("generates a stable id once at creation", () => {
    const first = createTask(SEED_TASKS, "todo", "A");
    const second = createTask(SEED_TASKS, "todo", "B");
    const a = first[first.length - 1];
    const b = second[second.length - 1];
    expect(a.id).not.toBe(b.id);
    // Recreating from the same input returns the same id: the id is generated
    // once, not on every re-render.
    expect(createTask(SEED_TASKS, "todo", "A", a.id)).toEqual(first);
    expect(createTaskId()).toMatch(/^task-/);
  });

  it("rejects empty and over-long content", () => {
    expect(() => createTask(SEED_TASKS, "todo", "   ")).toThrow(TaskContentError);
    expect(() => createTask(SEED_TASKS, "todo", "x".repeat(MAX_TASK_CONTENT_LENGTH + 1))).toThrow(
      TaskContentError
    );
  });

  it("enforces the task count bound", () => {
    const full: Task[] = Array.from({ length: 300 }, (_, i) => ({
      id: `t${i}`,
      columnId: "todo",
      content: `task ${i}`,
    }));
    expect(() => createTask(full, "todo", "one more")).toThrow(TaskLimitError);
  });
});

describe("editTask", () => {
  it("changes exactly one task's content and preserves its identity", () => {
    const before = snapshot(SEED_TASKS);
    const next = editTask(SEED_TASKS, "task7", "Build contact page with form");

    expect(next).toHaveLength(SEED_TASKS.length);
    const changed = next.filter((_, i) => snapshot(next)[i] !== before[i]);
    expect(changed).toHaveLength(1);
    expect(changed[0].id).toBe("task7");
    expect(changed[0].columnId).toBe("todo"); // identity preserved
    expect(changed[0].content).toBe("Build contact page with form");
  });

  it("rejects invalid content without touching the board", () => {
    expect(() => editTask(SEED_TASKS, "task7", "")).toThrow(TaskContentError);
  });
});

describe("deleteTask", () => {
  it("removes exactly the named task", () => {
    const next = deleteTask(SEED_TASKS, "task7");
    expect(next).toHaveLength(SEED_TASKS.length - 1);
    expect(next.some((t) => t.id === "task7")).toBe(false);
    // All other tasks identical, order preserved.
    const expected = snapshot(SEED_TASKS).filter((s) => !s.startsWith("task7::"));
    expect(snapshot(next)).toEqual(expected);
  });
});

describe("validateTaskContent", () => {
  it("flags empty, whitespace-only, and over-long content", () => {
    expect(validateTaskContent("")).toBe("empty");
    expect(validateTaskContent("   \n\t")).toBe("empty");
    expect(validateTaskContent("x".repeat(MAX_TASK_CONTENT_LENGTH))).toBeNull();
    expect(validateTaskContent("x".repeat(MAX_TASK_CONTENT_LENGTH + 1))).toBe("too-long");
  });
});

describe("sample data and reset", () => {
  it("seeds the thirteen sample tasks only when the board is empty", () => {
    expect(seedTasksIfEmpty([])).toHaveLength(13);
    const populated: Task[] = [{ id: "t1", columnId: "todo", content: "existing" }];
    expect(seedTasksIfEmpty(populated)).toBe(populated);
  });

  it("reset produces an empty board", () => {
    expect(emptyBoard()).toEqual([]);
  });
});
