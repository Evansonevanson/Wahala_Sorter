import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import type { Task } from '../types';

interface TaskCardProps {
  task: Task;
  onDelete: (id: string) => void;
}

export function TaskCard({ task, onDelete }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: {
      type: 'Task',
      task,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="opacity-50 bg-white p-4 rounded-xl border-2 border-indigo-500 border-dashed h-24 w-full dark:bg-slate-800"
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow group relative dark:bg-slate-800 dark:border-slate-600"
    >
      <div className="pr-8">
        <h3 className="text-sm font-medium text-slate-800 wrap-break-word dark:text-slate-200">{task.title}</h3>
      </div>
      
      <div className="mt-4 flex items-center justify-between text-xs text-slate-500 font-medium dark:text-slate-400">
        <span>{format(task.createdAt, 'MMM d, h:mm a')}</span>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(task.id);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all focus:opacity-100 dark:hover:bg-red-900/50"
        title="Delete Task"
        aria-label="Delete Task"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
