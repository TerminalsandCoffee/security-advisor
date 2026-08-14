# RAF's Command Center

A single-file, offline kanban/scrum dashboard. No backend, no build step, no dependencies — open `kanban-scrum-board.html` in a browser and go.

Built for quick-capture: when you remember a stray task, plop it into the box at the top and hit Enter (or press `/` anywhere to jump there) so it doesn't get lost.

## Features

- Quick-add bar for instant capture, with priority
- Draggable cards across columns, reorderable within a column
- Columns are fully editable: add, rename, delete, reorder
- Card details: notes, priority (low/medium/high/urgent), due date, tags
- Overdue / due-today highlighting
- Search and priority/overdue filters
- Dark and light themes
- Export/Import as JSON for backups or moving between machines

## Data storage

Everything is saved to the browser's `localStorage`, scoped to wherever the file is being served from. Two things worth knowing:

- **Local file vs. GitHub Pages are separate origins.** If you open `kanban-scrum-board.html` directly (`file://...`) and later host this same repo on GitHub Pages, the hosted version starts with an empty board — they don't share storage. Use **Export** on one and **Import** on the other to move data across.
- Clearing browser data/history for this origin will wipe the board. Export regularly.

## Usage

Just open `kanban-scrum-board.html` in any modern browser. No server required.
