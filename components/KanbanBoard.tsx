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
} from "@/lib/board";
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

export function KanbanBoard() {
  const [columns, setColumns] = useState<Column[]>(defaultCols);
  const pickedUpTaskColumn = useRef<ColumnId | null>(null);
  const columnsId = useMemo(() => columns.map((col) => col.id), [columns]);

  // Sample tasks are seeded only when the board is empty (first run);
  // see lib/board.ts and the README for the persistence decision.
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
  useEffect(() => {
    setMounted(true);
  }, []);

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
      <div className="mb-2 flex justify-end">
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
