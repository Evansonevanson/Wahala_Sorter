# Wahala Sorter — Code Audit

**Auditor:** Lead Software Auditor  
**Scope:** `src/` directory  
**Criteria:** Vulnerabilities, Performance Traps, Accessibility Misses, Principle Violations

---

## 1. Vulnerabilities

No `dangerouslySetInnerHTML`, no XSS vectors, no API keys in the client. The attack surface is minimal because this is a client-only app with no network calls. However, there are two robustness issues that border on security.

### 1.1 Unvalidated localStorage Deserialization

**The Problem:**  
The app reads tasks from localStorage and passes the result directly to `JSON.parse` with no schema validation. While there's a `try/catch` to handle parse errors, it does not verify that the parsed data actually conforms to the `Task` interface. A corrupted or manually-edited localStorage entry could inject non-conforming objects into the app state.

```tsx
// WahalaBoard.tsx:43-48
const saved = localStorage.getItem(STORAGE_KEY);
if (saved) {
  try {
    setTasks(JSON.parse(saved));
  } catch (e) {
    console.error('Failed to load tasks', e);
  }
}
```

**The Risk:**  
If a malformed object (e.g., `{ id: null, title: 42, status: 'Yesterday' }`) enters the state, downstream code assumes valid types. `tasks.filter((t) => t.id === activeId)` would fail silently. `format(task.createdAt, ...)` would crash. The `as ColumnId` cast on line 140 would mask a type error and propagate an invalid value.

**The Fix:**  
Validate the parsed data before committing it to state. A lightweight runtime check (or a library like `zod`) ensures the data matches the expected shape.

```tsx
useEffect(() => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.every(isValidTask)) {
        setTasks(parsed);
      } else {
        console.warn('Invalid task data in localStorage, starting fresh');
      }
    } catch (e) {
      console.error('Failed to load tasks', e);
    }
  }
  setIsLoaded(true);
}, []);

// Guard function — one source of truth for validation
function isValidTask(data: unknown): data is Task {
  if (!data || typeof data !== 'object') return false;
  const t = data as Record<string, unknown>;
  return (
    typeof t.id === 'string' &&
    typeof t.title === 'string' &&
    (t.status === 'Now' || t.status === 'Soon' || t.status === 'Later') &&
    typeof t.createdAt === 'number'
  );
}
```

**The Lesson:**  
Never trust external data, even from localStorage. The user's own browser can be compromised, or they may have browser extensions that tamper with storage. Validate at every boundary where data enters your system.

### 1.2 `as ColumnId` Type Assertion Masks Runtime Errors

**The Problem:**  
Line 140 of `WahalaBoard.tsx` uses a TypeScript type assertion to force a value into the `ColumnId` type without any runtime check.

```tsx
newTasks[activeIndex].status = overId as ColumnId;
```

If `overId` is not one of `'Now'`, `'Soon'`, or `'Later'` (due to a bug in the drag system or a future code change), this assertion silences the type error and propagates an invalid value through the entire application.

**The Risk:**  
An invalid column value would cause the task to disappear from all columns (since `visibleTasks.filter(t => t.status === col.id)` won't match any column). The task would be orphaned — present in the array but invisible in the UI. The user can never delete or move it again.

**The Fix:**  
Replace the type assertion with a runtime guard:

```tsx
function isColumnId(value: string): value is ColumnId {
  return value === 'Now' || value === 'Soon' || value === 'Later';
}

// In handleDragOver:
if (isColumnId(overId)) {
  newTasks[activeIndex].status = overId;
}
```

**The Lesson:**  
`as` type assertions are a promise to the compiler that you know better. When you're wrong, the compiler can't help you. Prefer user-defined type guards (`value is Type`) that verify at runtime.

---

## 2. Performance Traps

### 2.1 Every Keystroke Re-renders Every Task Card

**The Problem:**  
`newTaskTitle` lives as state in `WahalaBoard`. Every keystroke in the add-task input calls `setNewTaskTitle`, which re-renders the entire `WahalaBoard` component, including all `Column` and `TaskCard` children. With 50+ tasks across three columns, this causes measurable layout thrashing.

```tsx
// WahalaBoard.tsx:185-186
onChange={(e) => setNewTaskTitle(e.target.value)}
```

Each keystroke triggers this call chain:
```
input onChange → setNewTaskTitle → WahalaBoard re-render → 3× Column re-render → N× TaskCard re-render
```

**The Risk:**  
On mid-range devices, typing becomes sluggish. The input cursor may stutter behind the user's keystrokes. Drag-and-drop performance degrades because every drag event triggers state updates that re-render the entire board.

**The Fix:**  
Apply `React.memo` to `TaskCard` and `Column` so they only re-render when their props actually change. A `TaskCard`'s props (`task` object reference, `onDelete` callback) change on every parent render because `visibleTasks.filter(...)` creates a new array, which creates new objects... Actually, the `task` prop is an element of the `tasks` array — if the array reference changes (which it does on every `setTasks`), the `task` objects inside it are the same references (since we use immutable updates). So `React.memo` with a shallow comparison would work for `TaskCard`.

But the filter itself creates a new array each time, which would cause `Column` to re-render even if the tasks haven't changed. So `Column` needs `React.memo` too.

```tsx
// TaskCard.tsx
export const TaskCard = React.memo(function TaskCard({ task, onDelete }: TaskCardProps) {
  // ... existing code
});

// Column.tsx  
export const Column = React.memo(function Column({ id, title, tasks, onDeleteTask }: ColumnProps) {
  // ... existing code
});
```

Additionally, the `deleteTask` function in `WahalaBoard` is recreated every render, breaking `React.memo`'s comparison. It should be wrapped in `useCallback`:

```tsx
const deleteTask = useCallback((id: string) => {
  setTasks(tasks.filter((t) => t.id !== id));
}, []);
```

Wait — this closes over `tasks` which would be stale. Better approach using the callback form:

```tsx
const deleteTask = useCallback((id: string) => {
  setTasks((prev) => prev.filter((t) => t.id !== id));
}, []);
```

Now `deleteTask` is stable across renders, and `React.memo` on `Column` and `TaskCard` works correctly.

**The Lesson:**  
`React.memo` is not an optimization — it's a correctness tool for preventing wasted work. The rule: if a component receives props that are expensive to render, and those props often don't change, memoize it. But remember: `React.memo` only helps if the props are stable (use `useCallback`/`useMemo` for functions and objects).

### 2.2 Drag Events Trigger Full Re-renders

**The Problem:**  
`handleDragOver` fires continuously as the user drags a card. Every call invokes `setTasks`, which triggers a full re-render of the board, all columns, and all task cards. During a drag operation, this can fire 30–60 times per second.

```tsx
// WahalaBoard.tsx:102-144
const handleDragOver = (event: DragOverEvent) => {
  // ... finds indices, calls setTasks
  setTasks((tasks) => { ... });
};
```

**The Risk:**  
Drag feels janky, especially on lower-end devices. The floating overlay stutters behind the cursor because the main thread is busy re-rendering task cards that haven't changed.

**The Fix:**  
Combine `React.memo` (from fix 2.1) with the observation that most drag-over events don't actually change the task list. Early-return when the column or position hasn't changed:

```tsx
const handleDragOver = (event: DragOverEvent) => {
  const { active, over } = event;
  if (!over) return;

  const activeId = active.id;
  const overId = over.id;
  if (activeId === overId) return;

  // Already handled — no-op
  // ... rest of logic only runs when there's an actual change
};
```

The code already has these early returns, which is good. But with `React.memo` in place, even when `setTasks` is called, only the columns whose task arrays actually changed will re-render.

**The Lesson:**  
Early returns are your first line of defense against unnecessary work. The second line is `React.memo`. The third is profiling with React DevTools to confirm your assumptions about what re-renders.

### 2.3 Inline Filter Creates New Arrays Every Render

**The Problem:**  
Each column receives a freshly-filtered array on every render:

```tsx
tasks={visibleTasks.filter((t) => t.status === col.id)}
```

This creates a new array reference even when no tasks have changed, defeating `React.memo` on `Column` unless we also memoize the filter.

**The Fix:**  
Memoize the filtered arrays using `useMemo`:

```tsx
const tasksByColumn = useMemo(() => {
  const map: Record<ColumnId, Task[]> = { Now: [], Soon: [], Later: [] };
  for (const task of visibleTasks) {
    map[task.status].push(task);
  }
  return map;
}, [visibleTasks]);
```

Then pass `tasksByColumn[col.id]` instead of calling `filter` in the render. This creates the arrays once per state change, not once per column per render.

**The Lesson:**  
Derived data should be computed with `useMemo`, not re-computed inline during render. This is especially important when the derived data is passed as props to memoized children.

---

## 3. Accessibility (a11y) Misses

### 3.1 User Dropdown Is Mouse-Only

**The Problem:**  
The user dropdown in the Navbar opens on `onMouseEnter` and closes on `onMouseLeave`. Keyboard users — including users who navigate with Tab, screen reader users, and voice navigation users — cannot access the dropdown at all.

```tsx
// Navbar.tsx:33-34
onMouseEnter={() => setDropdownOpen(true)}
onMouseLeave={() => setDropdownOpen(false)}
```

**The Risk:**  
A user who cannot use a mouse cannot log out, cannot see their profile option, and effectively has a broken navigation. This is a critical accessibility failure.

**The Fix:**  
Replace the hover-only interaction with a click toggle that works with both mouse and keyboard. Use ARIA attributes to communicate the menu state to screen readers.

```tsx
const [dropdownOpen, setDropdownOpen] = useState(false);
const dropdownRef = useRef<HTMLDivElement>(null);

// Close on Escape key
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setDropdownOpen(false);
  };
  if (dropdownOpen) {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }
}, [dropdownOpen]);

// Close on click outside
useEffect(() => {
  const handleClickOutside = (e: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
      setDropdownOpen(false);
    }
  };
  if (dropdownOpen) {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }
}, [dropdownOpen]);

return (
  <div ref={dropdownRef} className="relative">
    <button
      onClick={() => setDropdownOpen(!dropdownOpen)}
      aria-expanded={dropdownOpen}
      aria-haspopup="true"
      className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
    >
      <User className="size-5 text-slate-600 dark:text-slate-400" />
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{userName || 'User'}</span>
    </button>
    {dropdownOpen && (
      <div
        role="menu"
        className="absolute right-0 mt-1 w-44 bg-white dark:bg-slate-800 rounded-lg shadow-lg border ... z-50"
      >
        <button role="menuitem" className="flex items-center gap-2 w-full px-3 py-2 text-sm ...">
          <UserCircle className="size-4" />
          Profile
        </button>
        <hr role="separator" />
        <button
          role="menuitem"
          onClick={() => { onLogout(); setDropdownOpen(false); }}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 ..."
        >
          <LogOut className="size-4" />
          Logout
        </button>
      </div>
    )}
  </div>
);
```

Key changes:
- `onClick` toggle instead of `onMouseEnter`/`onMouseLeave`
- `aria-expanded` and `aria-haspopup` on the trigger button
- `role="menu"` and `role="menuitem"` on the dropdown and items
- Escape key handler to close the menu
- Click-outside handler to close the menu
- Focus remains manageable

**The Lesson:**  
`onMouseEnter`/`onMouseLeave` are purely visual interactions. Any interactive element must be reachable and operable via keyboard. The `aria-*` attributes are not optional extras — they are the contract between your UI and assistive technology.

### 3.2 Delete Button Hidden Until Hover

**The Problem:**  
The delete button on each task card is invisible until the user hovers over the card:

```tsx
className="... opacity-0 group-hover:opacity-100 ... focus:opacity-100"
```

While the comment says `focus:opacity-100` (to support keyboard users), the button itself can't receive focus because it's `opacity-0` — keyboard users would need to tab to it first, but they can't see where it is. This creates a catch-22.

**The Risk:**  
A keyboard-only user or screen reader user cannot discover the delete action. They would need to guess that pressing Tab repeatedly might eventually land on a hidden button. Most users would simply assume deletion is impossible with a keyboard.

**The Fix:**  
Always show the delete button, but make it visually subdued when not hovered. Alternatively, keep it hidden but ensure it's focusable (it already is, since it's a `<button>` — but the user can't see it).

Better approach: make it visible at reduced opacity and become fully opaque on hover:

```tsx
className="... opacity-30 group-hover:opacity-100 focus:opacity-100 ..."
```

This way the button is always visible enough to be discoverable, and becomes prominent on interaction.

**The Lesson:**  
`opacity-0` hides content from sighted users AND keyboard users (they can't see where to focus). If an element is important enough to be a user-facing control, it should be discoverable without requiring a mouse hover.

### 3.3 Icon-Only Buttons Missing Descriptive Text

**The Problem:**  
The dark mode toggle button has `aria-label="Toggle dark mode"` (good). The add-task button has `aria-label="Add Task"` (good). The delete button has `aria-label="Delete Task"` (good).

However, the close (X) button on the login form does NOT have an `aria-label`:

```tsx
<button onClick={onClose} className="absolute top-3 right-3 ...">
  <X className="size-5" />
</button>
```

A screen reader would announce "button" with no indication of what it does.

**The Risk:**  
A screen reader user in the login form cannot close it. They are trapped in the modal.

**The Fix:**  
Add `aria-label` to the close button:

```tsx
<button
  onClick={onClose}
  aria-label="Close login form"
  className="absolute top-3 right-3 ..."
>
  <X className="size-5" />
</button>
```

Also audit all icon-only buttons for `aria-label`:
- The dark mode toggle: ✅ has `aria-label`
- The add-task button: ✅ has `aria-label`  
- The delete button: ✅ has `aria-label`
- The close button: ❌ missing — fixed above

**The Lesson:**  
Any button that contains only an icon (no visible text) must have an `aria-label`. The icon itself may be decorative, but the button's purpose must be communicated. As a habit, always add `aria-label` when you use an icon-only button.

### 3.4 Low Contrast on Secondary Text

**The Problem:**  
The task date uses `text-slate-500` at `text-xs` (12px). The "No wahala here" message uses `text-slate-400` with `opacity-60`. These combinations fall below the WCAG AA contrast ratio of 4.5:1 for normal text.

```tsx
// TaskCard.tsx:48-49
<div className="mt-4 flex items-center justify-between text-xs text-slate-500 font-medium ...">
  <span>{format(task.createdAt, 'MMM d, h:mm a')}</span>
</div>

// Column.tsx:52-53
<div className="... text-center text-slate-400 opacity-60 dark:text-slate-500">
```

**The Risk:**  
Users with low vision, or anyone viewing the app on a phone in bright sunlight (a common scenario in Lagos, Nigeria), cannot read the task dates or the empty-state messages.

**The Fix:**  
Use darker text colors and remove the extra opacity reduction:

```tsx
// TaskCard — change text-slate-500 to text-slate-600
<div className="... text-xs text-slate-600 font-medium dark:text-slate-400">

// Column — remove opacity-60, use text-slate-500 directly
<div className="... text-center text-slate-500 dark:text-slate-400">
```

**The Lesson:**  
WCAG contrast ratios are not bureaucratic overhead — they map directly to real-world readability. A rule of thumb: never reduce opacity on text, and never go lighter than `text-slate-600` on a white background at small font sizes.

---

## 4. Principle Violations

### 4.1 `handleDragOver` Violates Single Responsibility Principle

**The Problem:**  
The `handleDragOver` function handles three distinct scenarios in one 42-line function: dragging over a task in the same column, dragging over a task in a different column, and dragging over an empty column. Each scenario has different logic, different state transitions, and different edge cases.

```tsx
// WahalaBoard.tsx:102-144 — three concerns in one function
const handleDragOver = (event: DragOverEvent) => {
  // 1. Common guards (good)
  if (!over) return;
  if (activeId === overId) return;

  // 2. Is it over a task in a different column? Change status + reorder
  if (isOverTask) {
    if (tasks[activeIndex].status !== tasks[overIndex].status) {
      // change column...
    }
    // reorder...
  }

  // 3. Is it over an empty column? Change status only
  if (isOverColumn) {
    // change column, move to end...
  }
};
```

**The Risk:**  
A bug fix for "dropping into an empty column" risks breaking "dropping onto a task in a different column" because they share the same function scope, the same closure variables, and the same `setTasks` updater. A well-intentioned change to one path can silently corrupt the other.

**The Fix:**  
Extract each scenario into a named function:

```tsx
const handleDragOver = (event: DragOverEvent) => {
  const { active, over } = event;
  if (!over || active.id === over.id) return;

  const isActiveTask = active.data.current?.type === 'Task';
  if (!isActiveTask) return;

  const activeId = active.id;
  const overId = over.id;

  if (over.data.current?.type === 'Task') {
    setTasks((prev) => handleDragOverTask(prev, activeId, overId));
  } else if (over.data.current?.type === 'Column') {
    setTasks((prev) => handleDragOverColumn(prev, activeId, overId as ColumnId));
  }
};

function handleDragOverTask(tasks: Task[], activeId: string, overId: string): Task[] {
  const activeIndex = tasks.findIndex((t) => t.id === activeId);
  const overIndex = tasks.findIndex((t) => t.id === overId);

  if (tasks[activeIndex].status !== tasks[overIndex].status) {
    const newTasks = [...tasks];
    newTasks[activeIndex].status = tasks[overIndex].status;
    return arrayMove(newTasks, activeIndex, overIndex);
  }
  return arrayMove(tasks, activeIndex, overIndex);
}

function handleDragOverColumn(tasks: Task[], activeId: string, columnId: ColumnId): Task[] {
  const activeIndex = tasks.findIndex((t) => t.id === activeId);
  const newTasks = [...tasks];
  newTasks[activeIndex].status = columnId;
  return arrayMove(newTasks, activeIndex, newTasks.length - 1);
}
```

**The Lesson:**  
A function that has multiple "if this, then that" branches with different logic is a sign that SRP has been violated. Extract early. Each extracted function can be unit-tested in isolation, understood at a glance, and changed without fear of collateral damage.

### 4.2 Prop Drilling of `isLoggedIn`

**The Problem:**  
`isLoggedIn` is defined in `App`, passed to `WahalaBoard`, and used there to control the task limit and visibility filter. This is fine for one level. However, if `Column` or `TaskCard` ever needed to know the login state (e.g., to show a "login to delete" tooltip), it would need to be threaded through two more levels.

```tsx
App          — isLoggedIn defined here
├── Navbar   — receives isLoggedIn
├── WahalaBoard — receives isLoggedIn (uses it)
│   ├── Column   — does NOT receive isLoggedIn (but might need it in the future)
│   │   └── TaskCard — does NOT receive isLoggedIn (but might need it in the future)
└── LoginForm
```

**The Risk:**  
This isn't a problem today, but it's a predictable future pain point. If a feature request says "show a lock icon on the delete button when not logged in," the `isLoggedIn` prop would need to be drilled through `WahalaBoard → Column → TaskCard`. That's three files changed for one small feature.

**The Fix:**  
Use React Context for "ambient" state that many components at different levels need. Create an `AuthContext`:

```tsx
// src/context/AuthContext.tsx
import { createContext, useContext, useState, type ReactNode } from 'react';

interface AuthContextValue {
  isLoggedIn: boolean;
  userName: string;
  login: (name?: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');

  const value: AuthContextValue = {
    isLoggedIn,
    userName,
    login: (name) => {
      setIsLoggedIn(true);
      if (name) setUserName(name.split(' ')[0]);
    },
    logout: () => {
      setIsLoggedIn(false);
      setUserName('');
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

Then `App.tsx` wraps everything in `<AuthProvider>` and any component can call `useAuth()` without prop drilling.

**The Lesson:**  
Prop drilling is acceptable for 1–2 levels. Beyond that, it creates coupling — every intermediate component must forward props it doesn't use. Context exists precisely for cross-cutting concerns like authentication, theming, and user preferences.

### 4.3 No Error Boundary

**The Problem:**  
There is no error boundary wrapping the application. If any component throws during rendering (e.g., `format()` receives an invalid timestamp), the entire React tree unmounts and the user sees a white screen.

```tsx
// main.tsx — no error boundary
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

**The Risk:**  
A single corrupted task (e.g., `createdAt: "yesterday"` instead of a number) crashes the entire app. The user loses access to all their tasks with no recovery path.

**The Fix:**  
Add an error boundary component:

```tsx
// src/components/ErrorBoundary.tsx
import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900 p-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">Something went wrong</h1>
            <p className="text-slate-500 dark:text-slate-400 mb-4">{this.state.error?.message}</p>
            <button
              onClick={() => { localStorage.removeItem('wahala-tasks'); window.location.reload(); }}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
            >
              Reset & Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

Then wrap `App` in `main.tsx`:

```tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
```

**The Lesson:**  
Error boundaries are not optional in production React apps. They are the difference between "the app crashed, I lost everything" and "the app crashed, here's what happened and here's how to recover."

### 4.4 `LoginForm` Calls `onLogin` Without Validation

**The Problem:**  
The login form submits and calls `onLogin(name)` with no validation — no check that the email field is non-empty, no check that the password is non-empty, no check that the name is provided during registration.

```tsx
// LoginForm.tsx:14-18
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  const name = isRegister ? nameRef.current?.value || '' : undefined;
  onLogin(name);
};
```

**The Risk:**  
A user can click "Create account" with all fields blank and be "logged in." The navbar will show an empty name. This undermines the entire concept of authentication and creates a confusing UX where the user appears logged in but has no identity.

**The Fix:**  
Add basic validation before submission:

```tsx
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  if (isRegister) {
    const name = nameRef.current?.value?.trim() || '';
    if (!name) {
      nameRef.current?.focus();
      return;
    }
    onLogin(name);
  } else {
    onLogin();
  }
};
```

Also add `required` attributes to the HTML inputs for browser-level validation:

```tsx
<input id="name" type="text" required placeholder="Enter full name" ... />
<input id="email" type="email" required placeholder="you@example.com" ... />
<input id="password" type="password" required placeholder="••••••••" ... />
```

**The Lesson:**  
Never trust user input, even in your own form. Validate early, validate visibly (show error messages), and validate at every level (HTML `required` + JS validation + server validation if applicable).

---

## Findings Summary

| # | Category | Severity | Issue | Fix |
|---|---|---|---|---|
| 1.1 | Vulnerability | Medium | Unvalidated localStorage data | Add runtime type guard |
| 1.2 | Vulnerability | Low | `as ColumnId` type assertion | Replace with type guard |
| 2.1 | Performance | High | Every keystroke re-renders all cards | `React.memo` + `useCallback` |
| 2.2 | Performance | Medium | Drag events re-render full board | `React.memo` + early returns |
| 2.3 | Performance | Low | Inline filter creates new arrays per render | `useMemo` for derived data |
| 3.1 | Accessibility | Critical | Dropdown is mouse-only | Click toggle + ARIA + keyboard |
| 3.2 | Accessibility | High | Delete button hidden until hover | Visible at reduced opacity |
| 3.3 | Accessibility | Medium | Close button missing aria-label | Add `aria-label="Close login form"` |
| 3.4 | Accessibility | Low | Low contrast on secondary text | Darker text colors, remove opacity |
| 4.1 | Principle | Medium | `handleDragOver` does three things | Extract into named functions |
| 4.2 | Principle | Low | Prop drilling of `isLoggedIn` | React Context |
| 4.3 | Principle | High | No error boundary | Add `ErrorBoundary` component |
| 4.4 | Principle | Medium | Form submission without validation | Add required checks |

---

*This audit was conducted against the `src/` directory. The codebase demonstrates solid fundamentals but has clear room for improvement in accessibility, performance under load, and defensive coding practices. None of the issues are "shipping blockers," but addressing them will significantly improve the app's robustness and inclusivity.*
