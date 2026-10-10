"use client";

import { useState } from "react";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { useDndContext, type UniqueIdentifier } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMemo } from "react";
import { Task, TaskCard } from "./TaskCard";
import { cva } from "class-variance-authority";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { GripVertical, Plus } from "lucide-react";
import { ScrollArea, ScrollBar } from "./ui/scroll-area";
import { validateTaskContent, MAX_TASK_CONTENT_LENGTH } from "@/lib/board";

export interface Column {
  id: UniqueIdentifier;
  title: string;
}

export type ColumnType = "Column";

export interface ColumnDragData {
  type: ColumnType;
  column: Column;
}

interface BoardColumnProps {
  column: Column;
  tasks: Task[];
  isOverlay?: boolean;
  // Task CRUD wiring. The drag overlay instance renders without these.
  onStartAddTask?: () => void;
  onCancelAddTask?: () => void;
  onSubmitAddTask?: (content: string) => void;
  isAddingTask?: boolean;
  onEditTask?: (taskId: UniqueIdentifier) => void;
  onDeleteTask?: (taskId: UniqueIdentifier) => void;
  editingTaskId?: UniqueIdentifier | null;
  onSaveEditTask?: (taskId: UniqueIdentifier, content: string) => void;
  onCancelEditTask?: () => void;
}

export function BoardColumn({
  column,
  tasks,
  isOverlay,
  onStartAddTask,
  onCancelAddTask,
  onSubmitAddTask,
  isAddingTask,
  onEditTask,
  onDeleteTask,
  editingTaskId,
  onSaveEditTask,
  onCancelEditTask,
}: BoardColumnProps) {
  const tasksIds = useMemo(() => {
    return tasks.map((task) => task.id);
  }, [tasks]);

  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    data: {
      type: "Column",
      column,
    } satisfies ColumnDragData,
    attributes: {
      roleDescription: `Column: ${column.title}`,
    },
  });

  const style = {
    transition,
    transform: CSS.Translate.toString(transform),
  };

  const variants = cva(
    "h-[500px] max-h-[500px] w-[350px] max-w-full bg-primary-foreground flex flex-col shrink-0 snap-center",
    {
      variants: {
        dragging: {
          default: "border-2 border-transparent",
          over: "ring-2 opacity-30",
          overlay: "ring-2 ring-primary",
        },
      },
    }
  );

  const showControls = !isOverlay && Boolean(onSubmitAddTask);

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={variants({
        dragging: isOverlay ? "overlay" : isDragging ? "over" : undefined,
      })}
    >
      <CardHeader className="p-4 font-semibold border-b-2 text-left flex flex-row space-between items-center">
        <Button
          variant={"ghost"}
          {...attributes}
          {...listeners}
          className=" p-1 text-primary/50 -ml-2 h-auto cursor-grab relative"
        >
          <span className="sr-only">{`Move column: ${column.title}`}</span>
          <GripVertical />
        </Button>
        <span className="ml-auto"> {column.title}</span>
      </CardHeader>
      <ScrollArea>
        <CardContent className="flex grow flex-col gap-2 p-2">
          {tasks.length === 0 && showControls && (
            <p className="p-4 text-center text-sm text-muted-foreground">
              No tasks here yet. Add one below.
            </p>
          )}
          <SortableContext items={tasksIds}>
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onEdit={onEditTask}
                onDelete={onDeleteTask}
                isEditing={editingTaskId !== null && editingTaskId === task.id}
                onSaveEdit={onSaveEditTask}
                onCancelEdit={onCancelEditTask}
              />
            ))}
          </SortableContext>
          {showControls &&
            (isAddingTask ? (
              <AddTaskForm
                columnTitle={column.title}
                onSubmit={(content) => onSubmitAddTask?.(content)}
                onCancel={onCancelAddTask}
              />
            ) : (
              <Button
                variant="outline"
                className="w-full border-dashed"
                onClick={onStartAddTask}
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add task
              </Button>
            ))}
        </CardContent>
      </ScrollArea>
    </Card>
  );
}

function AddTaskForm({
  columnTitle,
  onSubmit,
  onCancel,
}: {
  columnTitle: string;
  onSubmit: (content: string) => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-2 rounded-md border p-2"
      onSubmit={(event) => {
        event.preventDefault();
        const code = validateTaskContent(value);
        if (code) {
          setError(
            code === "empty"
              ? "Task content cannot be empty."
              : `Task content is limited to ${MAX_TASK_CONTENT_LENGTH} characters.`
          );
          return;
        }
        onSubmit(value.trim());
      }}
    >
      <Input
        aria-label={`New task content for ${columnTitle}`}
        placeholder="Task description"
        value={value}
        maxLength={MAX_TASK_CONTENT_LENGTH}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
        autoFocus
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{`Up to ${MAX_TASK_CONTENT_LENGTH} characters`}</span>
        <span aria-hidden>{`${value.length}/${MAX_TASK_CONTENT_LENGTH}`}</span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-row gap-2">
        <Button type="submit" size="sm" className="grow">
          Add task
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function BoardContainer({ children }: { children: React.ReactNode }) {
  const dndContext = useDndContext();

  const variations = cva("px-2 md:px-0 flex lg:justify-center pb-4", {
    variants: {
      dragging: {
        default: "snap-x snap-mandatory",
        active: "snap-none",
      },
    },
  });

  return (
    <ScrollArea
      className={variations({
        dragging: dndContext.active ? "active" : "default",
      })}
    >
      <div className="flex gap-4 items-center flex-row justify-center">
        {children}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
