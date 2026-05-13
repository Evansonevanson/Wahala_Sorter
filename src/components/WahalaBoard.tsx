import { useState, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import type { ColumnId, Task } from '../types';
import { Column } from './Column';
import { TaskCard } from './TaskCard';

const COLUMNS: { id: ColumnId; title: string }[] = [
  { id: 'Now', title: 'Now' },
  { id: 'Soon', title: 'Soon' },
  { id: 'Later', title: 'Later' },
];

const STORAGE_KEY = 'wahala-tasks';

interface WahalaBoardProps {
  isLoggedIn: boolean;
  onShowLogin: () => void;
}

const MAX_TASKS = 5;

export function WahalaBoard({ isLoggedIn, onShowLogin }: WahalaBoardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setTasks(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load tasks', e);
      }
    }
    setIsLoaded(true);
  }, []);

  // Save to local storage whenever tasks change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    }
  }, [tasks, isLoaded]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px tolerance before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    if (!isLoggedIn && tasks.length >= MAX_TASKS) {
      onShowLogin();
      return;
    }

    const newTask: Task = {
      id: crypto.randomUUID(),
      title: newTaskTitle.trim(),
      status: 'Now',
      createdAt: Date.now(),
    };

    setTasks([...tasks, newTask]);
    setNewTaskTitle('');
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter((t) => t.id !== id));
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = tasks.find((t) => t.id === active.id);
    if (task) setActiveTask(task);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const isActiveTask = active.data.current?.type === 'Task';
    const isOverTask = over.data.current?.type === 'Task';
    const isOverColumn = over.data.current?.type === 'Column';

    if (!isActiveTask) return;

    // Dropping a task over another task
    if (isOverTask) {
      setTasks((tasks) => {
        const activeIndex = tasks.findIndex((t) => t.id === activeId);
        const overIndex = tasks.findIndex((t) => t.id === overId);
        
        if (tasks[activeIndex].status !== tasks[overIndex].status) {
          // Task moved to a different column over another task
          const newTasks = [...tasks];
          newTasks[activeIndex].status = tasks[overIndex].status;
          return arrayMove(newTasks, activeIndex, overIndex);
        }

        // Same column reordering
        return arrayMove(tasks, activeIndex, overIndex);
      });
    }

    // Dropping a task over an empty column area
    if (isOverColumn) {
      setTasks((tasks) => {
        const activeIndex = tasks.findIndex((t) => t.id === activeId);
        const newTasks = [...tasks];
        newTasks[activeIndex].status = overId as ColumnId;
        return arrayMove(newTasks, activeIndex, newTasks.length - 1);
      });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const isActiveTask = active.data.current?.type === 'Task';
    if (!isActiveTask) return;

    setTasks((tasks) => {
      const activeIndex = tasks.findIndex((t) => t.id === activeId);
      const overIndex = tasks.findIndex((t) => t.id === overId);

      if (activeIndex !== overIndex && tasks[activeIndex].status === tasks[overIndex]?.status) {
         return arrayMove(tasks, activeIndex, overIndex);
      }
      return tasks;
    });
  };

  if (!isLoaded) return null;

  const visibleTasks = isLoggedIn ? tasks : tasks.slice(0, MAX_TASKS);

  return (
    <div className="max-w-6xl mx-auto p-3 sm:p-4 md:p-8">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight dark:text-slate-100">The Wahala Sorter</h1>
        <p className="text-sm sm:text-base text-slate-500 mt-1 dark:text-slate-400">Sort out your daily chaos with calm.</p>
      </header>

      <form onSubmit={addTask} className="mb-6 sm:mb-8 relative max-w-xl">
        <input
          type="text"
          placeholder="What's the next wahala?"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          className="w-full pl-4 pr-12 py-3 rounded-xl border border-slate-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow text-slate-700 placeholder-slate-400 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200 dark:placeholder-slate-500"
        />
        <button
          type="submit"
          disabled={!newTaskTitle.trim()}
          className="absolute right-2 top-2 p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Add Task"
        >
          <Plus className="w-5 h-5" />
        </button>
      </form>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {COLUMNS.map((col) => (
            <Column
              key={col.id}
              id={col.id}
              title={col.title}
              tasks={visibleTasks.filter((t) => t.status === col.id)}
              onDeleteTask={deleteTask}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask ? (
            <div className="rotate-3 shadow-xl">
              <TaskCard task={activeTask} onDelete={() => {}} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
