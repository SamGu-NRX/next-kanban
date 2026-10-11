import { describe, expect, it, beforeEach } from "vitest";

import {
  COLUMN_IDS,
  MAX_CONTENT_LENGTH,
  MAX_PAYLOAD_BYTES,
  MAX_TASKS,
  SCHEMA_VERSION,
  STORAGE_KEY,
  parseBoardPayload,
  saveBoard,
  loadBoard,
  serializeBoard,
  validateBoardPayload,
  type PersistedTask,
} from "@/lib/persistence";

function task(overrides: Partial<PersistedTask> = {}): PersistedTask {
  return { id: "t1", content: "A task", columnId: "todo", ...overrides };
}

// Storage tests must not inherit stored state from each other.
beforeEach(() => {
  window.localStorage.clear();
});

describe("validateBoardPayload", () => {
  it("accepts a valid payload", () => {
    const check = validateBoardPayload(
      { version: SCHEMA_VERSION, tasks: [task()] },
      100
    );
    expect(check).toEqual({ ok: true, tasks: [task()] });
  });

  it("rejects non-object payloads", () => {
    expect(validateBoardPayload("nope", 10)).toMatchObject({
      ok: false,
      reason: "Board data is not an object.",
    });
  });

  it("rejects a missing version", () => {
    expect(validateBoardPayload({ tasks: [] }, 10)).toMatchObject({
      ok: false,
      reason: "Board data is missing a version field.",
    });
  });

  it("rejects a newer schema version with a specific message", () => {
    const check = validateBoardPayload({ version: 2, tasks: [] }, 10);
    expect(check).toMatchObject({ ok: false });
    expect(check.ok === false && check.reason).toContain("newer version");
  });

  it("rejects an older schema version", () => {
    expect(
      validateBoardPayload({ version: SCHEMA_VERSION - 1, tasks: [] }, 10)
    ).toMatchObject({ ok: false });
  });

  it("rejects a payload without a task list", () => {
    expect(validateBoardPayload({ version: SCHEMA_VERSION }, 10)).toMatchObject({
      ok: false,
      reason: "Board data has no task list.",
    });
  });

  it("rejects payloads over the task-count bound", () => {
    const tasks = Array.from({ length: MAX_TASKS + 1 }, (_, i) =>
      task({ id: `t${i}` })
    );
    expect(validateBoardPayload({ version: SCHEMA_VERSION, tasks }, 1000)).toMatchObject({
      ok: false,
    });
  });

  it("rejects payloads over the byte bound", () => {
    const check = validateBoardPayload(
      { version: SCHEMA_VERSION, tasks: [] },
      MAX_PAYLOAD_BYTES + 1
    );
    expect(check).toMatchObject({ ok: false });
    expect(check.ok === false && check.reason).toContain("too large");
  });

  it("rejects a task without an id", () => {
    const check = validateBoardPayload(
      { version: SCHEMA_VERSION, tasks: [{ content: "x", columnId: "todo" }] },
      10
    );
    expect(check).toMatchObject({ ok: false });
  });

  it("rejects duplicate task ids", () => {
    const check = validateBoardPayload(
      { version: SCHEMA_VERSION, tasks: [task(), task()] },
      10
    );
    expect(check).toMatchObject({ ok: false });
    expect(check.ok === false && check.reason).toContain("duplicate id");
  });

  it("rejects empty task content", () => {
    expect(
      validateBoardPayload(
        { version: SCHEMA_VERSION, tasks: [task({ content: "   " })] },
        10
      )
    ).toMatchObject({ ok: false });
  });

  it("rejects task content over the length bound", () => {
    const check = validateBoardPayload(
      {
        version: SCHEMA_VERSION,
        tasks: [task({ content: "x".repeat(MAX_CONTENT_LENGTH + 1) })],
      },
      10
    );
    expect(check).toMatchObject({ ok: false });
    expect(check.ok === false && check.reason).toContain("200 characters");
  });

  it("rejects an unknown column id", () => {
    const check = validateBoardPayload(
      { version: SCHEMA_VERSION, tasks: [task({ columnId: "archive" as never })] },
      10
    );
    expect(check).toMatchObject({ ok: false });
    expect(check.ok === false && check.reason).toContain('unknown column "archive"');
  });

  it("accepts every known column id", () => {
    const tasks = COLUMN_IDS.map((columnId, i) => task({ id: `t${i}`, columnId }));
    expect(
      validateBoardPayload({ version: SCHEMA_VERSION, tasks }, 100)
    ).toEqual({ ok: true, tasks });
  });
});

describe("serializeBoard / parseBoardPayload", () => {
  it("round-trips tasks", () => {
    const tasks = [task(), task({ id: "t2", columnId: "done" })];
    const serialized = serializeBoard(tasks);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    const parsed = parseBoardPayload(serialized.payload);
    expect(parsed).toEqual({ status: "loaded", tasks });
  });

  it("marks the payload with the schema version", () => {
    const serialized = serializeBoard([task()]);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    expect(JSON.parse(serialized.payload).version).toBe(SCHEMA_VERSION);
  });
});

describe("saveBoard / loadBoard (jsdom localStorage)", () => {
  it("starts empty on first run", () => {
    window.localStorage.removeItem(STORAGE_KEY);
    expect(loadBoard()).toEqual({ status: "empty" });
  });

  it("persists and reloads committed tasks", () => {
    window.localStorage.removeItem(STORAGE_KEY);
    expect(saveBoard([task()])).toEqual({ status: "saved" });
    expect(loadBoard()).toEqual({ status: "loaded", tasks: [task()] });
  });

  it("leaves stored bytes untouched when corrupt data is rejected", () => {
    const corrupt = "{not json";
    window.localStorage.setItem(STORAGE_KEY, corrupt);
    const result = loadBoard();
    expect(result.status).toBe("invalid");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(corrupt);
  });

  it("rejects schema-mismatched stored data without wiping it", () => {
    const raw = JSON.stringify({ version: 99, tasks: [] });
    window.localStorage.setItem(STORAGE_KEY, raw);
    expect(loadBoard().status).toBe("invalid");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(raw);
  });

  it("reports quota failure from saveBoard without throwing", () => {
    window.localStorage.removeItem(STORAGE_KEY);
    // jsdom's Storage ignores both plain assignment and vi.spyOn for its
    // methods, so swap the whole storage object: the availability probe
    // succeeds, the real write throws quota.
    const quota = new DOMException("full", "QuotaExceededError");
    const backing = new Map<string, string>();
    const fake = {
      getItem: (k: string) => (backing.has(k) ? backing.get(k) ?? null : null),
      setItem: (k: string, v: string) => {
        if (k === STORAGE_KEY) throw quota;
        backing.set(k, v);
      },
      removeItem: (k: string) => backing.delete(k),
      clear: () => backing.clear(),
      key: () => null,
      length: 0,
    };
    Object.defineProperty(window, "localStorage", {
      get: () => fake,
      configurable: true,
    });
    try {
      const result = saveBoard([task()]);
      expect(result.status).toBe("quota");
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe(null);
    } finally {
      delete (window as { localStorage?: unknown }).localStorage;
    }
  });
});
