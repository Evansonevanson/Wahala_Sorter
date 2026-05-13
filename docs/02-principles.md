# Wahala Sorter — Code Review: Principles & Patterns

**Reviewer:** Senior Software Architect  
**Scope:** `src/` directory  
**Objective:** Identify core software engineering principles and design patterns, with evidence from the codebase.

---

## 1. Single Responsibility Principle (SRP)

### Definition
Every component, function, or module should have exactly one reason to change. It should do one thing and do it well.

### Why It Matters
In a production-grade app, requirements shift constantly. If a component handles drag-and-drop *and* login *and* data persistence, a change to any one of those concerns risks breaking the other two. SRP is the insulation that keeps unrelated failures from cascading.

### Evidence

**`TaskCard.tsx`** — responsible for *one* thing: rendering a single task card and making it draggable. It knows nothing about columns, the task list, or authentication.

```tsx
export function TaskCard({ task, onDelete }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({...});
  // ... renders one card
}
```

**`Column.tsx`** — responsible for *one* thing: being a drop zone and containing a list of cards. It delegates card rendering to `TaskCard` and drag coordination to `DndContext` (higher up).

```tsx
export function Column({ id, title, tasks, onDeleteTask }: ColumnProps) {
  const { setNodeRef } = useDroppable({...});
  // ... renders a column wrapper around TaskCards
}
```

**`WahalaBoard.tsx`** — owns the task list state and drag coordination, but delegates column rendering and card rendering to child components.

```tsx
// WahalaBoard orchestrates but doesn't render individual cards
{COLUMNS.map((col) => (
  <Column key={col.id} id={col.id} title={col.title}
    tasks={visibleTasks.filter((t) => t.status === col.id)}
    onDeleteTask={deleteTask} />
))}
```

**`LoginForm.tsx`** — responsible solely for the login/register form UI and capturing input. It calls `onLogin(name)` when done but does not decide what happens after login.

```tsx
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  const name = isRegister ? nameRef.current?.value || '' : undefined;
  onLogin(name);
};
```

### Impact If Ignored
If `TaskCard` also handled column logic, every time you modified column behavior you'd risk breaking every task card. The component tree would devolve into a monolithic block where no single piece can be understood, tested, or replaced in isolation.

---

## 2. Separation of Concerns (SoC)

### Definition
Different dimensions of the application (UI markup, business logic, styling) should live in distinct, loosely-coupled layers.

### Why It Matters
When styling is tangled with logic and markup, a simple colour change requires spelunking through event handlers. When logic is embedded in JSX, you cannot test it without rendering the full DOM. SoC ensures each layer can evolve independently.

### Evidence

**Layer 1 — Logic (TypeScript):** All state management, event handlers, and data transformations live in the component functions, separate from the JSX.

```tsx
// WahalaBoard.tsx: logic is above return()
const addTask = (e: React.FormEvent) => { ... };
const deleteTask = (id: string) => { ... };
const handleDragOver = (event: DragOverEvent) => { ... };

return ( /* JSX below */ );
```

**Layer 2 — UI (JSX):** The markup is declarative JSX, describing *what* to render, not *how* to render it.

```tsx
// Column.tsx: describes the column structure
<div className={`flex flex-col rounded-2xl border ${columnStyles[id]} ...`}>
  <div className={`...${headerStyles[id]}`}>
    <span>{title}</span>
    <span>{tasks.length}</span>
  </div>
</div>
```

**Layer 3 — Styling (Tailwind utility classes):** All visual concerns are expressed through declarative utility classes, not inline `<style>` blocks or CSS-in-JS objects mixed into the logic.

```tsx
// Pure styling, no logic here
className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 cursor-grab ..."
```

**Layer 4 — Types (separate file):** Data shapes are extracted into `src/types.ts`, keeping the component files focused on behaviour.

```ts
// types.ts: pure data contracts
export interface Task {
  id: string;
  title: string;
  status: ColumnId;
  createdAt: number;
}
```

**Layer 5 — Entry point (`main.tsx`):** The React bootstrapping is isolated in its own file.

```tsx
// main.tsx: only concerned with mounting the app
createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
```

### Impact If Ignored
A tangled codebase where a CSS change requires modifying `handleDragOver` logic (because styles and handlers are mixed) is a maintenance nightmare. New developers cannot quickly locate where a visual bug originates. The app becomes "Lagos-traffic" code — everyone knows it's slow, but no one can untangle it.

---

## 3. Component Composition

### Definition
Building complex UIs by nesting smaller, reusable components inside each other, passing data down via props.

### Why It Matters
Composition is the React equivalent of Lego bricks. You build a small, trustworthy piece (`TaskCard`), then combine several into a medium piece (`Column`), then combine those into the full board (`WahalaBoard`). Each piece is independently testable and replaceable.

### Evidence

**Composition hierarchy:**

```
main.tsx
  └── App.tsx
        ├── Navbar.tsx        ← composed inline
        ├── WahalaBoard.tsx   ← composed inline
        │     ├── Column.tsx  ← mapped from COLUMNS array
        │     │     └── TaskCard.tsx  ← mapped from tasks array
        │     └── DragOverlay
        │           └── TaskCard.tsx  ← reused!
        └── LoginForm.tsx     ← conditionally rendered
```

**Props drilling keeps composition explicit:**

```tsx
// App.tsx passes data down
<WahalaBoard isLoggedIn={isLoggedIn} onShowLogin={() => setLoginSource('limit')} />

// WahalaBoard passes to Column
<Column key={col.id} id={col.id} title={col.title}
  tasks={visibleTasks.filter((t) => t.status === col.id)}
  onDeleteTask={deleteTask} />

// Column passes to TaskCard
<TaskCard key={task.id} task={task} onDelete={onDeleteTask} />
```

**Reuse of `TaskCard` in two contexts:**

```tsx
// Inside Column (normal card)
<TaskCard key={task.id} task={task} onDelete={onDeleteTask} />

// Inside DragOverlay (ghost card while dragging)
<TaskCard task={activeTask} onDelete={() => {}} />
```

The same component renders in two different contexts — one as an interactive card, one as a floating ghost. This is composition at work.

### Impact If Ignored
Without composition, `WahalaBoard` would be a single 500-line file containing three copies of column markup, each with inline task rendering. Adding a fourth column would mean copy-pasting 50 more lines. Bug fixes would need to be applied in three separate places.

---

## 4. Immutability

### Definition
Data is never mutated in place. Instead, a new copy is created with the desired changes, and the old version is discarded.

### Why It Matters
React detects changes by reference equality — it checks whether the old array `===` the new array. If you mutate an array in place, the reference stays the same, and React skips the re-render. The UI would show stale data. Immutability is not a style preference; it is a correctness requirement for React.

### Evidence

**Adding a task — spread operator creates a new array:**

```tsx
setTasks([...tasks, newTask]);   // WahalaBoard.tsx:88
```

`[...tasks, newTask]` creates a brand-new array containing all old elements plus the new one. The old `tasks` array is untouched.

**Deleting a task — `filter` returns a new array:**

```tsx
setTasks(tasks.filter((t) => t.id !== id));   // WahalaBoard.tsx:93
```

`filter` never modifies the original array; it returns a new one with the matching element excluded.

**Moving tasks via `handleDragOver` — spread + arrayMove:**

```tsx
// WahalaBoard.tsx:125-127
const newTasks = [...tasks];
newTasks[activeIndex].status = tasks[overIndex].status;
return arrayMove(newTasks, activeIndex, overIndex);
```

A shallow copy (`[...tasks]`) is made first. The status is changed on the copy, not the original. `arrayMove` then returns another new array with the reordered items.

**State updater function form for safety:**

```tsx
setTasks((tasks) => { ... });   // WahalaBoard.tsx:119, 137, 159
```

Using the callback form of `setTasks` guarantees we always operate on the latest state, even if multiple state updates are batched.

**Visibility filter — slice creates a new array:**

```tsx
const visibleTasks = isLoggedIn ? tasks : tasks.slice(0, MAX_TASKS);  // WahalaBoard.tsx:172
```

`slice` returns a new array. `tasks` itself is never modified.

### Impact If Ignored
If the code used `tasks.push(newTask)` instead of `[...tasks, newTask]`, the array reference would not change. React would see the same object in memory, skip the re-render, and the UI would appear frozen. The task would "exist" in memory but be invisible to the user. Debugging this is notoriously difficult because `console.log` shows the array "correctly" (since the console shows a live reference).

---

## 5. Declarative UI

### Definition
You describe *what* the UI should look like for a given state, not *how* to transition from one state to another. React handles the "how."

### Why It Matters
Imperative code (e.g., jQuery) requires you to write step-by-step DOM instructions: "find the column div, create a new card element, append it as a child, update the counter text." This is fragile and error-prone. Declarative code lets you say "when `tasks` contains these items, render them in columns" — and React figures out the minimal DOM changes.

### Evidence

**Conditional rendering — `{loginSource && <LoginForm />}`:**

```tsx
// App.tsx:28
{loginSource && (
  <LoginForm
    message={loginSource === 'limit' ? "You've reached the limit of 5 tasks. Login to add more." : undefined}
    onClose={() => setLoginSource(null)}
    onLogin={(name) => { ... }}
  />
)}
```

This is a pure description: "IF `loginSource` is truthy, THEN render `<LoginForm>` with these props." No DOM manipulation code, no `document.createElement`.

**Ternary in JSX — `{isLoggedIn ? <UserArea /> : <LoginButton />}`:**

```tsx
// Navbar.tsx:30
{isLoggedIn ? ( /* user dropdown */ ) : ( /* login button */ )}
```

The UI is a direct function of state. When `isLoggedIn` flips, React automatically removes one branch and adds the other.

**Conditional styles — `dark:` prefix:**

```tsx
className="bg-white p-4 ... dark:bg-slate-800 dark:border-slate-600"
```

The markup describes both light and dark appearances in one place. Tailwind and the `dark` class on `<html>` determine which one activates.

**Column rendering via map — no for-loops:**

```tsx
// WahalaBoard.tsx:207
{COLUMNS.map((col) => (
  <Column key={col.id} id={col.id} title={col.title} ... />
))}
```

Describes the entire column layout based on data. Adding a column means adding one object to the `COLUMNS` array, not writing new JSX.

**Empty state as a declaration:**

```tsx
// Column.tsx:51
{tasks.length === 0 && (
  <div className="...">
    <p className="text-sm font-medium mt-2">No wahala here</p>
  </div>
)}
```

When the column is empty, show a message. This is a rule, not a sequence of instructions.

### Impact If Ignored
An imperative approach would require code like this scattered across the codebase:

```javascript
// Hypothetical imperative version
function addCardToColumn(columnId, task) {
  const column = document.querySelector(`[data-column="${columnId}"]`);
  const card = document.createElement('div');
  card.textContent = task.title;
  column.appendChild(card);
}
```

This is brittle — it couples to class names, DOM structure, and ordering. One HTML structure change breaks every selector. Declarative code eliminates this entire class of bugs.

---

## 6. DRY (Don't Repeat Yourself)

### Definition
Every piece of knowledge or logic should have a single, unambiguous representation within the system. Duplication is the root of maintenance rot.

### Why It Matters
When the same logic appears in three places and a bug is found, it must be fixed in all three — but inevitably one gets missed. DRY ensures a fix in one place propagates everywhere.

### Evidence

**Column definitions extracted to a constant:**

```tsx
// WahalaBoard.tsx:20-24 — ONE source of truth
const COLUMNS: { id: ColumnId; title: string }[] = [
  { id: 'Now', title: 'Now' },
  { id: 'Soon', title: 'Soon' },
  { id: 'Later', title: 'Later' },
];
```

These three entries drive the column rendering. No duplicate `<Column>` JSX tags. To add a fourth column, you add one array entry.

**Deriving column data — filter + map replaces repetition:**

```tsx
// Instead of writing three separate Column tags with manual filters:
<Column tasks={visibleTasks.filter(t => t.status === 'Now')} ... />
<Column tasks={visibleTasks.filter(t => t.status === 'Soon')} ... />
<Column tasks={visibleTasks.filter(t => t.status === 'Later')} ... />

// We write ONE map:
{COLUMNS.map((col) => (
  <Column tasks={visibleTasks.filter((t) => t.status === col.id)} ... />
))}
```

**Storage key extracted to a constant:**

```tsx
// WahalaBoard.tsx:26
const STORAGE_KEY = 'wahala-tasks';
```

Used in two `useEffect` calls (load and save). If the key needed to change, it changes in one place.

**Task limit extracted to a constant:**

```tsx
// WahalaBoard.tsx:33
const MAX_TASKS = 5;
```

Used for both the guard (`tasks.length >= MAX_TASKS`) and the visibility filter (`tasks.slice(0, MAX_TASKS)`).

**Color and style maps keep per-column CSS DRY:**

```tsx
// Column.tsx:13-17
const columnStyles: Record<ColumnId, string> = {
  Now: 'bg-red-50/50 border-red-100 dark:bg-red-950/30 dark:border-red-900',
  Soon: 'bg-amber-50/50 border-amber-100 dark:bg-amber-950/30 dark:border-amber-900',
  Later: 'bg-emerald-50/50 border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900',
};
```

Instead of three separate CSS classes or inline conditionals, a single lookup maps column to styles.

**Type reuse across files:**

```ts
// types.ts — imported everywhere
export interface Task { id: string; title: string; status: ColumnId; createdAt: number; }
```

Five components import and use `Task`. The type definition lives exactly once.

### Impact If Ignored
Without `COLUMNS` and the `map` pattern, adding a new column like "Yesterday" would require:
1. Adding a new `<Column>` JSX block
2. Adding a new `filter` call
3. Updating the column count in three places
4. Creating new style variables

Each of these is an opportunity for a copy-paste error. DRY eliminates this.

---

## 7. Lifting State Up

### Definition
When multiple components need to share the same state, that state is hoisted to their nearest common ancestor, which then passes it down via props.

### Why It Matters
If `isLoggedIn` lived in `Navbar` and `WahalaBoard` each had their own copy, they could drift out of sync — the navbar showing "Welcome, Evans!" while the board still enforces the 5-task limit. Lifting state up guarantees a single source of truth.

### Evidence

**All top-level state lives in `App.tsx`:**

```tsx
// App.tsx:7-13
const [loginSource, setLoginSource] = useState<'nav' | 'limit' | null>(null);
const [isLoggedIn, setIsLoggedIn] = useState(false);
const [userName, setUserName] = useState('');
const [isDark, setIsDark] = useState(() => { ... });
```

**Passed down to both Navbar and WahalaBoard:**

```tsx
<Navbar isLoggedIn={isLoggedIn} userName={userName} ...
<WahalaBoard isLoggedIn={isLoggedIn} ...
```

When `setIsLoggedIn(true)` is called (from the login form callback), both children re-render with the new value simultaneously.

**State changes flow through a single callback chain:**

```
LoginForm.onLogin(name) → App.onLogin → setIsLoggedIn(true), setUserName(name)
                                        → Navbar re-renders (shows "Evans")
                                        → WahalaBoard re-renders (removes limit)
```

### Impact If Ignored
If `Navbar` and `WahalaBoard` each had their own `isLoggedIn` state, a user could log in through the navbar but the board would still block at 5 tasks. This is the kind of heisenbug that escapes QA and is reported by users — and is maddening to reproduce.

---

## 8. Controlled Components

### Definition
Form inputs are controlled by React state rather than letting the DOM manage their value internally. The component stores the input value, and every keystroke updates the state, which then re-renders the input with the new value.

### Why It Matters
With uncontrolled inputs, React cannot react to changes — you have to query the DOM to read the value. Controlled inputs give React full awareness of what the user is typing, enabling instant validation, conditional rendering, and seamless integration with the rest of the state.

### Evidence

**Add-task input:**

```tsx
// WahalaBoard.tsx:182-186
<input
  value={newTaskTitle}
  onChange={(e) => setNewTaskTitle(e.target.value)}
/>
```

- `value={newTaskTitle}` — React controls what the input displays.
- `onChange={(e) => setNewTaskTitle(e.target.value)}` — every keystroke updates state.
- The submit button's disabled state derives from the same state: `disabled={!newTaskTitle.trim()}`.

**Login form inputs are uncontrolled via refs (intentional design choice):**

```tsx
// LoginForm.tsx:44-49
<input ref={nameRef} id="name" type="text" placeholder="Enter full name" ... />
```

This is a pragmatic exception. The login form fields do not need to trigger live UI changes — they only need to be read on submit. `useRef` avoids re-rendering on every keystroke for a form where instant feedback is unnecessary.

### Impact If Ignored
If the add-task input were uncontrolled, the `disabled` attribute on the submit button would not update as the user types. The button would stay grayed out until the user clicked elsewhere, producing a confusing UX. The `onSubmit` handler would need `document.querySelector('input').value` — coupling logic to DOM structure.

---

## 9. Observer Pattern (via Props/Callbacks)

### Definition
A component (the subject) allows other components (observers) to register interest in events by passing callback functions. When the event occurs, the subject calls the callback, and the observer reacts.

### Why It Matters
Direct parent-child communication via props is not always sufficient. Sometimes a deeply nested child needs to trigger a change in a distant ancestor. Callbacks provide this without coupling the child to the ancestor's implementation details.

### Evidence

**`Navbar` → `App` — Login button click:**

```tsx
// Navbar.tsx:59
<button onClick={onLoginClick} ...>Login</button>

// App.tsx:24 — onLoginClick is defined as:
onLoginClick={() => setLoginSource('nav')}
```

`Navbar` does not know what "open login form" means. It just calls `onLoginClick`. `App` decides the behaviour.

**`TaskCard` → `WahalaBoard` — Delete action:**

```tsx
// TaskCard.tsx:55
onDelete(task.id);

// WahalaBoard.tsx:92 — the handler:
const deleteTask = (id: string) => {
  setTasks(tasks.filter((t) => t.id !== id));
};
```

`TaskCard` announces "the user wants to delete this task." It does not know how deletion works. `WahalaBoard` handles it.

**`WahalaBoard` → `App` — Limit reached:**

```tsx
// WahalaBoard.tsx:77
onShowLogin();

// App.tsx:26 — wired as:
onShowLogin={() => setLoginSource('limit')}
```

`WahalaBoard` says "the login form needs to appear." `App` decides which message to show.

### Impact If Ignored
Without the callback pattern, `TaskCard` would need a direct reference to `WahalaBoard`'s state setter (or worse, to localStorage). Any change to how tasks are stored would require updating every card. The system would lose the ability to swap out implementations — a hallmark of rigid, unscalable architecture.

---

## 10. Side-Effect Isolation (via `useEffect`)

### Definition
Operations that interact with the outside world (browser APIs, localStorage, timers) are isolated into `useEffect` blocks, separate from the pure rendering logic.

### Why It Matters
Rendering should be a pure function of props and state. Side effects (writing to localStorage, manipulating the DOM) break that purity. `useEffect` quarantines these impure operations so the render cycle remains predictable and testable.

### Evidence

**Dark mode side effect:**

```tsx
// App.tsx:15-18
useEffect(() => {
  document.documentElement.classList.toggle('dark', isDark);
  localStorage.setItem('dark-mode', String(isDark));
}, [isDark]);
```

The side effect (DOM manipulation + localStorage write) is isolated from the render. The `[isDark]` dependency ensures it only runs when necessary.

**Data persistence side effects:**

```tsx
// WahalaBoard.tsx:42-52 — Load
useEffect(() => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) { setTasks(JSON.parse(saved)); }
  setIsLoaded(true);
}, []);

// WahalaBoard.tsx:55-59 — Save
useEffect(() => {
  if (isLoaded) { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
}, [tasks, isLoaded]);
```

Loading and saving are separate effects with different dependencies. The `isLoaded` guard prevents the save effect from overwriting localStorage with an empty array before loading completes. This is a correct, race-condition-free design.

### Impact If Ignored
If localStorage writes happened directly inside event handlers or render functions, the app would write on every keystroke, every render, and every drag event — thrashing the disk and degrading performance. Isolating side effects to `useEffect` with appropriate dependencies ensures they fire only when the relevant state actually changes.

---

## Summary Table

| Principle | Where Applied | What Breaks If Ignored |
|---|---|---|
| **SRP** | Each component does one thing (TaskCard renders, Column drops, WahalaBoard orchestrates) | Monolithic components impossible to test or reason about |
| **SoC** | Logic (TS), UI (JSX), Styling (Tailwind) in distinct layers | CSS changes require touching business logic |
| **Composition** | App → Navbar / WahalaBoard → Column → TaskCard | Duplicated markup, no reusability |
| **Immutability** | `[...tasks, newTask]`, `filter`, `slice`, callback updaters | React skips re-renders, UI shows stale data |
| **Declarative UI** | `{condition && <Component />}`, `.map()`, `dark:` variants | Brittle imperative DOM manipulation code |
| **DRY** | `COLUMNS` array, `MAX_TASKS`, `STORAGE_KEY`, `Task` type | Copy-paste errors, bug fixes applied inconsistently |
| **Lifting State** | `isLoggedIn` in App, passed down to both children | State desync: navbar shows logged in but board enforces limit |
| **Controlled Components** | Add-task input: `value={newTaskTitle}` + `onChange` | Submit button disabled state out of sync, DOM queries needed |
| **Observer Pattern** | `onLoginClick`, `onDelete`, `onShowLogin` callbacks | Child components tightly coupled to parent implementation |
| **Side-Effect Isolation** | Dark mode, load/save in `useEffect` blocks | Disk thrashing, race conditions between load and save |

---

*Analysis completed against `src/` directory. No critical architectural violations detected. The codebase reflects a disciplined understanding of React fundamentals and software design principles.*
