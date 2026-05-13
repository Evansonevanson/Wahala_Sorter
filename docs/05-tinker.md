# Tinker

**The Selected Line:**
const stored = localStorage.getItem('dark-mode'); (Line 11)

1. **The Prediction:**
   What I think it does: This line is the app's "memory." It checks if the user previously chose a "calm" dark theme or a "bright" light theme before the page fully loads.

What will break if changed: If I change 'dark-mode' to something else, the app will lose its memory. Every time you refresh the page, the app will reset to the default Light Mode, even if you previously toggled it to Dark. It won't "crash," but it will feel "broken" to the user because their preference isn't being respected.

2. **The Change:**
   I am changing the key name so it no longer matches the key used to save the data in the useEffect on Line 16.

**Original:**
TypeScript
const stored = localStorage.getItem('dark-mode');

**Modified:**
TypeScript
const stored = localStorage.getItem('broken-link');

3. **The Actual Result**
   Observation: I toggled the app to Dark Mode. The background turned dark—this worked because the state was still active in memory.

The Problem: I refreshed the browser.

Result: The app flashed dark for a microsecond and then snapped back to Light Mode.

Why? The useEffect was still successfully saving the preference to the key 'dark-mode', but the initialization line (Line 10) was looking in a different box called 'broken-link'. Since that box was empty, it defaulted to false (Light Mode).

4. **The Lesson**
   The lesson is about consistency between reading and writing state.

In your code, localStorage acts like a tiny database:

- setItem() writes data
- getItem() reads data

Both operations must use the exact same key.

when i made the change, i created a mismatch:

- The app saved to 'dark-mode'
- The app loaded from 'broken-link'

So the app was writing to one storage location and reading from another.
