// Versioned, validated persistence for the kanban board.
//
// Storage contract (see README "Persistence" and docs/receipts/):
// - first run: nothing stored -> the board seeds its sample tasks
// - save failures (privacy mode, blocked storage, quota) surface a
//   non-blocking notice and never wipe the board
// - corrupted or out-of-bounds data is rejected with a specific message and
//   the stored bytes are left untouched (never silently wiped or replaced)
// - imports and loads share one validator with hard bounds

export const STORAGE_KEY = "kanban.board.v1";

export const SCHEMA_VERSION = 1;
export const MAX_TASKS = 300;
export const MAX_CONTENT_LENGTH = 200;
export const MAX_PAYLOAD_BYTES = 512 * 1024;

export const COLUMN_IDS = ["todo", "in-progress", "done"] as const;
export type PersistedColumnId = (typeof COLUMN_IDS)[number];

export type PersistedTask = {
  id: string;
  content: string;
  columnId: PersistedColumnId;
};

export type PersistedBoard = {
  version: number;
  tasks: PersistedTask[];
};

export type LoadResult =
  | { status: "empty" }
  | { status: "loaded"; tasks: PersistedTask[] }
  | { status: "invalid"; reason: string }
  | { status: "unavailable"; reason: string };

export type SaveResult =
  | { status: "saved" }
  | { status: "unavailable"; reason: string }
  | { status: "quota"; reason: string };

export type BoardValidation =
  | { ok: true; tasks: PersistedTask[] }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Validates one parsed board payload against the versioned schema with hard
 * bounds. Also used for imports, so every path into the board is bounded.
 */
export function validateBoardPayload(
  parsed: unknown,
  rawByteLength: number
): BoardValidation {
  if (rawByteLength > MAX_PAYLOAD_BYTES) {
    return {
      ok: false,
      reason: `Board data is too large (${rawByteLength} bytes; limit ${MAX_PAYLOAD_BYTES}).`,
    };
  }
  if (!isRecord(parsed)) {
    return { ok: false, reason: "Board data is not an object." };
  }
  const { version, tasks } = parsed;
  if (version !== SCHEMA_VERSION) {
    return {
      ok: false,
      reason:
        typeof version === "number"
          ? version > SCHEMA_VERSION
            ? `Board data was saved by a newer version (v${version}; this app supports v${SCHEMA_VERSION}).`
            : `Board data is from an older version (v${version}).`
          : "Board data is missing a version field.",
    };
  }
  if (!Array.isArray(tasks)) {
    return { ok: false, reason: "Board data has no task list." };
  }
  if (tasks.length > MAX_TASKS) {
    return {
      ok: false,
      reason: `Board data has ${tasks.length} tasks; limit is ${MAX_TASKS}.`,
    };
  }
  const seenIds = new Set<string>();
  const validated: PersistedTask[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const entry = tasks[i];
    if (!isRecord(entry)) {
      return {
        ok: false,
        reason: `Task ${i + 1}: expected an object.`,
      };
    }
    const { id, content, columnId } = entry;
    if (typeof id !== "string" || id.length === 0) {
      return { ok: false, reason: `Task ${i + 1}: missing id.` };
    }
    if (seenIds.has(id)) {
      return { ok: false, reason: `Task ${i + 1}: duplicate id "${id}".` };
    }
    seenIds.add(id);
    if (typeof content !== "string" || content.trim().length === 0) {
      return { ok: false, reason: `Task ${i + 1}: content is empty.` };
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return {
        ok: false,
        reason: `Task ${i + 1}: content exceeds ${MAX_CONTENT_LENGTH} characters.`,
      };
    }
    if (
      typeof columnId !== "string" ||
      !COLUMN_IDS.includes(columnId as PersistedColumnId)
    ) {
      return {
        ok: false,
        reason: `Task ${i + 1}: unknown column "${String(columnId)}".`,
      };
    }
    validated.push({
      id,
      content,
      columnId: columnId as PersistedColumnId,
    });
  }
  return { ok: true, tasks: validated };
}

/**
 * Serializes and validates a board payload, returning the exact bytes to
 * store. Saving validates too, so nothing invalid is ever written.
 */
export function serializeBoard(tasks: PersistedTask[]): {
  ok: true; payload: string; byteLength: number;
} | { ok: false; reason: string } {
  const payload = JSON.stringify({ version: SCHEMA_VERSION, tasks });
  const byteLength = new TextEncoder().encode(payload).length;
  const check = validateBoardPayload(JSON.parse(payload), byteLength);
  if (!check.ok) return check;
  return { ok: true, payload, byteLength };
}

/**
 * Returns the storage object, or a typed unavailability reason. Probes the
 * store with a write so privacy modes and blocked storage fail here instead
 * of at first save.
 */
export function getStorage(): {
  ok: true; storage: Storage;
} | { ok: false; reason: string } {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return {
        ok: false,
        reason: "Local storage is not available in this browser.",
      };
    }
    const probeKey = `${STORAGE_KEY}.probe`;
    window.localStorage.setItem(probeKey, "1");
    window.localStorage.removeItem(probeKey);
    return { ok: true, storage: window.localStorage };
  } catch (error) {
    return {
      ok: false,
      reason: `Local storage is unavailable (${describeStorageError(error)}).`,
    };
  }
}

export function describeStorageError(error: unknown): string {
  if (isRecord(error) && typeof error.name === "string") {
    return error.name;
  }
  return error instanceof Error ? error.message : String(error);
}

export function loadBoard(): LoadResult {
  const access = getStorage();
  if (!access.ok) return { status: "unavailable", reason: access.reason };
  let raw: string | null;
  try {
    raw = access.storage.getItem(STORAGE_KEY);
  } catch (error) {
    return {
      status: "unavailable",
      reason: `Saved board could not be read (${describeStorageError(error)}).`,
    };
  }
  if (raw === null) return { status: "empty" };
  return parseBoardPayload(raw);
}

/** Parses and validates raw stored text. Exported for reuse by imports. */
export function parseBoardPayload(raw: string): LoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      status: "invalid",
      reason: `Saved board is not valid JSON (${describeStorageError(error)}).`,
    };
  }
  const byteLength = new TextEncoder().encode(raw).length;
  const check = validateBoardPayload(parsed, byteLength);
  if (!check.ok) return { status: "invalid", reason: check.reason };
  return { status: "loaded", tasks: check.tasks };
}

export function saveBoard(tasks: PersistedTask[]): SaveResult {
  const access = getStorage();
  if (!access.ok) return { status: "unavailable", reason: access.reason };
  const serialized = serializeBoard(tasks);
  if (!serialized.ok) return { status: "unavailable", reason: serialized.reason };
  try {
    access.storage.setItem(STORAGE_KEY, serialized.payload);
    return { status: "saved" };
  } catch (error) {
    if (isRecord(error) && typeof error.name === "string") {
      if (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED") {
        return {
          status: "quota",
          reason:
            "Local storage is full. Export your board or delete tasks, then try again.",
        };
      }
    }
    return {
      status: "unavailable",
      reason: `The board could not be saved (${describeStorageError(error)}).`,
    };
  }
}
