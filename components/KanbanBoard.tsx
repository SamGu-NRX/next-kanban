"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { BoardColumn, BoardContainer } from "./BoardColumn";
import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  useSensor,
  useSensors,
  KeyboardSensor,
  Announcements,
  UniqueIdentifier,
  TouchSensor,
  MouseSensor,
} from "@dnd-kit/core";
import { SortableContext, arrayMove } from "@dnd-kit/sortable";
import { type Task, TaskCard } from "./TaskCard";
import type { Column } from "./BoardColumn";
import { hasDraggableData } from "./utils";
import { coordinateGetter } from "./multipleContainersKeyboardPreset";
import {
  createTask,
  deleteTask,
  editTask,
  emptyBoard,
  seedTasksIfEmpty,
  type BoardColumnId,
} from "@/lib/board";
import {
  STORAGE_KEY,
  loadBoard,
  parseBoardPayload,
  saveBoard,
  serializeBoard,
} from "@/lib/persistence";
import { Button } from "./ui/button";

const defaultCols = [
  {
    id: "todo" as const,
    title: "Todo",
  },
  {
    id: "in-progress" as const,
    title: "In progress",
  },
  {
    id: "done" as const,
    title: "Done",
  },
] satisfies Column[];

export type ColumnId = (typeof defaultCols)[number]["id"];

// The column set is fixed; ids from Column rows are always one of these.
function asColumnId(id: UniqueIdentifier): ColumnId {
  return id as ColumnId;
}

/** Tasks as stored: ids are strings in the persisted schema. */
function toPersisted(tasks: Task[]) {
  return tasks.map((t) => ({
    id: String(t.id),
    content: t.content,
    columnId: t.columnId as BoardColumnId,
  }));
}

export function KanbanBoard() {
  const [columns, setColumns] = useState<Column[]>(defaultCols);
  const pickedUpTaskColumn = useRef<ColumnId | null>(null);
  const columnsId = useMemo(() => columns.map((col) => col.id), [columns]);

  // The seeded sample board is also the server render and the first client
  // render, so hydration matches; stored tasks load right after mount.
  const [tasks, setTasks] = useState<Task[]>(() => seedTasksIfEmpty([]));

  const [activeColumn, setActiveColumn] = useState<Column | null>(null);

  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // Transactional drag: moves during a drag land on a working copy, never on
  // committed state. onDragEnd commits the copy once; onDragCancel discards it.
  const [dragTasks, setDragTasks] = useState<Task[] | null>(null);
  const effectiveTasks = dragTasks ?? tasks;

  // The DragOverlay portal needs `document`; it is mounted client-side only,
  // after hydration, so the server render and the first client render match.
  const [mounted, setMounted] = useState(false);

  // Persistence state. storageNotice: saving/loading failed but the board
  // stays usable. conflictNotice: another view changed stored data while this
  // view has unsaved (dirty) work — auto-save is paused until it is resolved.
  // importNotice: an import file was rejected.
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const hydratedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load once after mount: stored tasks replace the seeded board; a corrupt
  // or unsupported store surfaces a notice and keeps its bytes untouched.
  useEffect(() => {
    setMounted(true);
    const result = loadBoard();
    if (result.status === "loaded") {
      setTasks(result.tasks.map((t) => ({ ...t })));
    } else if (result.status === "empty") {
      // First run: keep the seeded sample board and persist it.
      const saved = saveBoard(toPersisted(tasks));
      if (saved.status !== "saved") setStorageNotice(saved.reason);
    } else {
      setStorageNotice(
        `${result.reason} Showing sample data; the stored copy was not changed.`
      );
    }
    hydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist committed state. Never runs mid-drag (the working copy is not
  // committed), and pauses while a cross-tab conflict is unresolved so a
  // stale save can never silently overwrite the other view's board.
  useEffect(() => {
    if (!hydratedRef.current || dragTasks || conflictNotice) return;
    const result = saveBoard(toPersisted(tasks));
    if (result.status === "saved") {
      setStorageNotice(null);
    } else {
      setStorageNotice(result.reason);
    }
  }, [tasks, dragTasks, conflictNotice]);

  // Watch for another tab rewriting the board under us.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      if (event.newValue === null) {
        setConflictNotice(
          "The saved board was removed in another view. Export this board to keep it, or discard the notice and start empty."
        );
        return;
      }
      const parsed = parseBoardPayload(event.newValue);
      if (parsed.status !== "loaded") return;
      const incoming = JSON.stringify(parsed.tasks);
      const mine = JSON.stringify(toPersisted(tasks));
      if (incoming !== mine) {
        setConflictNotice(
          "Another view saved a different board. Load it, or export this board first to keep your copy."
        );
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [tasks]);

  function exportBoard() {
    const serialized = serializeBoard(toPersisted(tasks));
    if (!serialized.ok) {
      setStorageNotice(serialized.reason);
      return;
    }
    const blob = new Blob([serialized.payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "kanban-board.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importBoard(file: File) {
    let text: string;
    try {
      text = await file.text();
    } catch {
      setImportNotice("Import rejected: the file could not be read.");
      return;
    }
    const parsed = parseBoardPayload(text);
    if (parsed.status === "invalid" || parsed.status === "unavailable") {
      setImportNotice(`Import rejected: ${parsed.reason}`);
      return;
    }
    if (parsed.status === "empty") {
      setImportNotice("Import rejected: the file contained no board.");
      return;
    }
    // Importing is an explicit user choice, so it also resolves any open
    // conflict in favor of the imported board.
    setTasks(parsed.tasks.map((t) => ({ ...t })));
    setImportNotice(null);
    setConflictNotice(null);
  }

  // Task CRUD state.
  const [addingToColumn, setAddingToColumn] = useState<ColumnId | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<UniqueIdentifier | null>(null);
  const [resetArmed, setResetArmed] = useState(false);

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: coordinateGetter,
    })
  );

  function getDraggingTaskData(taskId: UniqueIdentifier, columnId: ColumnId) {
    const tasksInColumn = effectiveTasks.filter((task) => task.columnId === columnId);
    const taskPosition = tasksInColumn.findIndex((task) => task.id === taskId);
    const column = columns.find((col) => col.id === columnId);
    return {
      tasksInColumn,
      taskPosition,
      column,
    };
  }

  const announcements: Announcements = {
    onDragStart({ active }) {
      if (!hasDraggableData(active)) return;
      if (active.data.current?.type === "Column") {
        const startColumnIdx = columnsId.findIndex((id) => id === active.id);
        const startColumn = columns[startColumnIdx];
        return `Picked up Column ${startColumn?.title} at position: ${
          startColumnIdx + 1
        } of ${columnsId.length}`;
      } else if (active.data.current?.type === "Task") {
        const columnId = active.data.current.task.columnId;
        pickedUpTaskColumn.current = columnId;
        const { tasksInColumn, taskPosition, column } = getDraggingTaskData(
          active.id,
          columnId
        );
        return `Picked up Task ${
          active.data.current.task.content
        } at position: ${taskPosition + 1} of ${
          tasksInColumn.length
        } in column ${column?.title}`;
      }
    },
    onDragOver({ active, over }) {
      if (!hasDraggableData(active) || !hasDraggableData(over)) return;

      if (
        active.data.current?.type === "Column" &&
        over.data.current?.type === "Column"
      ) {
        const overColumnIdx = columnsId.findIndex((id) => id === over.id);
        return `Column ${active.data.current.column.title} was moved over ${
          over.data.current.column.title
        } at position ${overColumnIdx + 1} of ${columnsId.length}`;
      } else if (
        active.data.current?.type === "Task" &&
        over.data.current?.type === "Task"
      ) {
        const { tasksInColumn, taskPosition, column } = getDraggingTaskData(
          over.id,
          over.data.current.task.columnId
        );
        if (over.data.current.task.columnId !== pickedUpTaskColumn.current) {
          return `Task ${
            active.data.current.task.content
          } was moved over column ${column?.title} in position ${
            taskPosition + 1
          } of ${tasksInColumn.length}`;
        }
        return `Task was moved over position ${taskPosition + 1} of ${
          tasksInColumn.length
        } in column ${column?.title}`;
      }
    },
    onDragEnd({ active, over }) {
      if (!hasDraggableData(active) || !hasDraggableData(over)) {
        pickedUpTaskColumn.current = null;
        return;
      }
      if (
        active.data.current?.type === "Column" &&
        over.data.current?.type === "Column"
      ) {
        const overColumnPosition = columnsId.findIndex((id) => id === over.id);

        return `Column ${
          active.data.current.column.title
        } was dropped into position ${overColumnPosition + 1} of ${
          columnsId.length
        }`;
      } else if (
        active.data.current?.type === "Task" &&
        over.data.current?.type === "Task"
      ) {
        const { tasksInColumn, taskPosition, column } = getDraggingTaskData(
          over.id,
          over.data.current.task.columnId
        );
        if (over.data.current.task.columnId !== pickedUpTaskColumn.current) {
          return `Task was dropped into column ${column?.title} in position ${
            taskPosition + 1
          } of ${tasksInColumn.length}`;
        }
        return `Task was dropped into position ${taskPosition + 1} of ${
          tasksInColumn.length
        } in column ${column?.title}`;
      }
      pickedUpTaskColumn.current = null;
    },
    onDragCancel({ active }) {
      pickedUpTaskColumn.current = null;
      if (!hasDraggableData(active)) return;
      return `Dragging ${active.data.current?.type} cancelled.`;
    },
  };

  const anyNotice = storageNotice || conflictNotice || importNotice;

  return (
    <DndContext
      accessibility={{
        announcements,
      }}
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragCancel={onDragCancel}
    >
      {anyNotice && (
        <div
          role="status"
          className="mx-auto mb-4 max-w-3xl rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <div className="flex flex-col gap-2">
            {storageNotice && (
              <div className="flex items-center justify-between gap-3">
                <span>{storageNotice}</span>
                <Button variant="outline" size="sm" onClick={exportBoard}>
                  Export board
                </Button>
              </div>
            )}
            {conflictNotice && (
              <div className="flex items-center justify-between gap-3">
                <span>{conflictNotice}</span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const result = loadBoard();
                      if (result.status === "loaded") {
                        setTasks(result.tasks.map((t) => ({ ...t })));
                        setConflictNotice(null);
                      }
                    }}
                  >
                    Load the saved board
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportBoard}
                  >
                    Export my board
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConflictNotice(null)}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            )}
            {importNotice && (
              <div className="flex items-center justify-between gap-3">
                <span>{importNotice}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setImportNotice(null)}
                >
                  Dismiss
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
      {tasks.length === 0 && (
        <div
          role="status"
          className="mx-auto mb-4 flex max-w-xl flex-col items-center gap-2 rounded-lg border p-6 text-center"
        >
          <p className="font-semibold">Your board is empty</p>
          <p className="text-sm text-muted-foreground">
            Create your first task to get started.
          </p>
          <Button className="mt-1" onClick={() => setAddingToColumn("todo")}>
            Create your first task
          </Button>
        </div>
      )}
      <div className="mb-2 flex justify-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Import board from a JSON file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importBoard(file);
            event.target.value = "";
          }}
        />
        <Button variant="ghost" size="sm" onClick={exportBoard}>
          Export
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          Import
        </Button>
        <Button
          variant={resetArmed ? "destructive" : "ghost"}
          size="sm"
          disabled={tasks.length === 0 && !resetArmed}
          aria-label={
            resetArmed ? "Confirm board reset" : "Reset board to empty"
          }
          onClick={() => {
            if (resetArmed) {
              setTasks(emptyBoard());
              setEditingTaskId(null);
              setAddingToColumn(null);
              setResetArmed(false);
            } else {
              setResetArmed(true);
            }
          }}
          onBlur={() => setResetArmed(false)}
        >
          {resetArmed ? "Really reset? Click again" : "Reset board"}
        </Button>
      </div>
      <BoardContainer>
        <SortableContext items={columnsId}>
          {columns.map((col) => (
            <BoardColumn
              key={col.id}
              column={col}
              tasks={effectiveTasks.filter((task) => task.columnId === col.id)}
              isAddingTask={addingToColumn === col.id}
              onStartAddTask={() => setAddingToColumn(asColumnId(col.id))}
              onCancelAddTask={() => setAddingToColumn(null)}
              onSubmitAddTask={(content) => {
                setTasks((prev) => createTask(prev, asColumnId(col.id), content));
                setAddingToColumn(null);
              }}
              onEditTask={(taskId) => setEditingTaskId(taskId)}
              onDeleteTask={(taskId) =>
                setTasks((prev) => deleteTask(prev, taskId))
              }
              editingTaskId={editingTaskId}
              onSaveEditTask={(taskId, content) => {
                setTasks((prev) => editTask(prev, taskId, content));
                setEditingTaskId(null);
              }}
              onCancelEditTask={() => setEditingTaskId(null)}
            />
          ))}
        </SortableContext>
      </BoardContainer>

      {mounted &&
        createPortal(
          <DragOverlay>
            {activeColumn && (
              <BoardColumn
                isOverlay
                column={activeColumn}
                tasks={effectiveTasks.filter(
                  (task) => task.columnId === activeColumn.id
                )}
              />
            )}
            {activeTask && <TaskCard task={activeTask} isOverlay />}
          </DragOverlay>,
          document.body
        )}
    </DndContext>
  );

  function onDragStart(event: DragStartEvent) {
    if (!hasDraggableData(event.active)) return;
    // Snapshot the committed state as the drag's working copy.
    setDragTasks(tasks);
    const data = event.active.data.current;
    if (data?.type === "Column") {
      setActiveColumn(data.column);
      return;
    }

    if (data?.type === "Task") {
      setActiveTask(data.task);
      return;
    }
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveColumn(null);
    setActiveTask(null);

    const { active, over } = event;
    if (!over) {
      // Dropped outside any droppable: no valid destination, so restore the
      // pre-drag state instead of persisting intermediate movement.
      setDragTasks(null);
      pickedUpTaskColumn.current = null;
      return;
    }

    // Single commit point: a drop promotes the drag's working copy. A
    // cancelled drag never reaches this line, so intermediate movement is
    // never persisted.
    if (dragTasks) {
      setTasks(dragTasks);
      setDragTasks(null);
    }

    const activeId = active.id;
    const overId = over.id;

    if (!hasDraggableData(active)) return;

    const activeData = active.data.current;

    if (activeId === overId) return;

    const isActiveAColumn = activeData?.type === "Column";
    if (!isActiveAColumn) return;

    setColumns((columns) => {
      const activeColumnIndex = columns.findIndex((col) => col.id === activeId);

      const overColumnIndex = columns.findIndex((col) => col.id === overId);

      return arrayMove(columns, activeColumnIndex, overColumnIndex);
    });
  }

  function onDragCancel() {
    // Discard the working copy: committed tasks and column order are restored
    // exactly as they were when the drag started.
    setDragTasks(null);
    setActiveColumn(null);
    setActiveTask(null);
    pickedUpTaskColumn.current = null;
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    if (!hasDraggableData(active) || !hasDraggableData(over)) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    const isActiveATask = activeData?.type === "Task";
    const isOverATask = overData?.type === "Task";

    if (!isActiveATask) return;

    // Dragging a Task over another Task: updates land on the working copy
    // with new task objects (no in-place mutation).
    if (isActiveATask && isOverATask) {
      setDragTasks((current) => {
        if (!current) return current;
        const activeIndex = current.findIndex((t) => t.id === activeId);
        const overIndex = current.findIndex((t) => t.id === overId);
        const draggedTask = current[activeIndex];
        const overTask = current[overIndex];
        if (
          draggedTask &&
          overTask &&
          draggedTask.columnId !== overTask.columnId
        ) {
          const withColumn = current.map((t) =>
            t.id === activeId
              ? { ...t, columnId: asColumnId(overTask.columnId) }
              : t
          );
          return arrayMove(withColumn, activeIndex, overIndex - 1);
        }

        return arrayMove(current, activeIndex, overIndex);
      });
    }

    const isOverAColumn = overData?.type === "Column";

    // Dragging a Task over a column: move it into that column (end of list).
    if (isActiveATask && isOverAColumn) {
      setDragTasks((current) => {
        if (!current) return current;
        return current.map((t) =>
          t.id === activeId ? { ...t, columnId: asColumnId(overId) } : t
        );
      });
    }
  }
}
