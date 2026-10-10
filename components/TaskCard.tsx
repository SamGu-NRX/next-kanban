"use client";

import { useState } from "react";
import type { UniqueIdentifier } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cva } from "class-variance-authority";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { Badge } from "./ui/badge";
import { validateTaskContent, MAX_TASK_CONTENT_LENGTH } from "@/lib/board";

import type { Task } from "@/lib/board";
export type { Task } from "@/lib/board";

interface TaskCardProps {
  task: Task;
  isOverlay?: boolean;
  onEdit?: (taskId: UniqueIdentifier) => void;
  onDelete?: (taskId: UniqueIdentifier) => void;
  isEditing?: boolean;
  onSaveEdit?: (taskId: UniqueIdentifier, content: string) => void;
  onCancelEdit?: () => void;
}

export type TaskType = "Task";

export interface TaskDragData {
  type: TaskType;
  task: Task;
}

export function TaskCard({
  task,
  isOverlay,
  onEdit,
  onDelete,
  isEditing,
  onSaveEdit,
  onCancelEdit,
}: TaskCardProps) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: {
      type: "Task",
      task,
    } satisfies TaskDragData,
    attributes: {
      roleDescription: "Task",
    },
  });

  const style = {
    transition,
    transform: CSS.Translate.toString(transform),
  };

  const variants = cva("", {
    variants: {
      dragging: {
        over: "ring-2 opacity-30",
        overlay: "ring-2 ring-primary",
      },
    },
  });

  const showControls = !isOverlay && Boolean(onEdit || onDelete);

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={variants({
        dragging: isOverlay ? "overlay" : isDragging ? "over" : undefined,
      })}
    >
      <CardHeader className="px-3 py-3 space-between flex flex-row border-b-2 border-secondary relative">
        <Button
          variant={"ghost"}
          {...attributes}
          {...listeners}
          className="p-1 text-secondary-foreground/50 -ml-2 h-auto cursor-grab"
        >
          <span className="sr-only">Move task</span>
          <GripVertical />
        </Button>
        <Badge variant={"outline"} className="ml-auto font-semibold">
          Task
        </Badge>
      </CardHeader>
      {isEditing ? (
        <CardContent className="px-3 pt-3 pb-6">
          <TaskEditForm
            task={task}
            onSave={(content) => onSaveEdit?.(task.id, content)}
            onCancel={onCancelEdit}
          />
        </CardContent>
      ) : (
        <CardContent className="px-3 pt-3 pb-6 text-left whitespace-pre-wrap flex flex-row items-start justify-between gap-2">
          <span className="grow">{task.content}</span>
          {showControls && (
            <span className="flex shrink-0 flex-row gap-1">
              {onEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  aria-label={`Edit task: ${task.content}`}
                  onClick={() => onEdit(task.id)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="sr-only">{`Edit task: ${task.content}`}</span>
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete task: ${task.content}`}
                  onClick={() => onDelete(task.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="sr-only">{`Delete task: ${task.content}`}</span>
                </Button>
              )}
            </span>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function TaskEditForm({
  task,
  onSave,
  onCancel,
}: {
  task: Task;
  onSave: (content: string) => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(task.content);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
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
        onSave(value);
      }}
    >
      <Input
        aria-label={`Edit task: ${task.content}`}
        value={value}
        maxLength={MAX_TASK_CONTENT_LENGTH}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
        autoFocus
      />
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-2 flex flex-row justify-between gap-2">
        <Button type="submit" size="sm">
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
