import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { ColumnId, Task } from '../types';
import { TaskCard } from './TaskCard';

interface ColumnProps {
  id: ColumnId;
  title: string;
  tasks: Task[];
  onDeleteTask: (id: string) => void;
}

const columnStyles: Record<ColumnId, string> = {
  Now: 'bg-red-50/50 border-red-100 dark:bg-red-950/30 dark:border-red-900',
  Soon: 'bg-amber-50/50 border-amber-100 dark:bg-amber-950/30 dark:border-amber-900',
  Later: 'bg-emerald-50/50 border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900',
};

const headerStyles: Record<ColumnId, string> = {
  Now: 'text-red-700 bg-red-100/50 dark:text-red-300 dark:bg-red-900/50',
  Soon: 'text-amber-700 bg-amber-100/50 dark:text-amber-300 dark:bg-amber-900/50',
  Later: 'text-emerald-700 bg-emerald-100/50 dark:text-emerald-300 dark:bg-emerald-900/50',
};

export function Column({ id, title, tasks, onDeleteTask }: ColumnProps) {
  const { setNodeRef } = useDroppable({
    id: id,
    data: {
      type: 'Column',
      column: id,
    },
  });

  return (
    <div className={`flex flex-col rounded-2xl border ${columnStyles[id]} h-full min-h-[200px] sm:min-h-[350px] md:min-h-[500px] overflow-hidden`}>
      <div className={`px-4 py-3 border-b border-white/20 font-semibold flex items-center justify-between ${headerStyles[id]}`}>
        <span>{title}</span>
        <span className="text-xs py-0.5 px-2 rounded-full bg-white/60 font-medium dark:bg-white/20">
          {tasks.length}
        </span>
      </div>

      <div className="flex-1 p-3 overflow-y-auto">
        <div ref={setNodeRef} className="flex flex-col gap-3 min-h-[150px] h-full">
          <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} onDelete={onDeleteTask} />
            ))}
          </SortableContext>
          
          {tasks.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 opacity-60 dark:text-slate-500">
              <p className="text-sm font-medium mt-2">No wahala here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
