# Obsidian Time Tracker

An Obsidian plugin that records the time you use for each project and work.

## Features

- Start and stop a timer. Only one timer runs at a time.
- The status bar shows the timer that runs.
- A side view shows the totals for the last 7 days and for all projects.
- A code block in a note shows the totals for a day or a week.
- If a note has the same name as a project or a work, the name is a link to that note.
- If the open note has `project` or `work` in its frontmatter, the start dialog uses these values.

## Commands

- **Start timer**: Open the dialog. Write a project and a work, then click **Start**.
- **Stop timer**: Stop the timer that runs.
- **Open view**: Open the side view. You can also click the timer icon in the ribbon.

## Code block

Put this code block in a note:

````
```work-timer
day
```
````

- `day` shows the totals for one day. `week` shows the totals for 7 days that end on that day.
- To set the day, add a date: `week 2026-10-31`.
- If you do not add a date, the plugin uses the note name (for example, a daily note `2026-10-31.md`). If the note name is not a date, the plugin uses today.

## Build

```bash
npm install
```

```bash
npm run build
```

This makes `main.js`. Use `npm run dev` to build again each time you change `main.ts`.

## Install

1. Make the folder `<vault>/.obsidian/plugins/work-timer/`.
2. Copy `main.js`, `manifest.json` and `styles.css` into this folder.
3. In Obsidian, open **Settings > Community plugins** and enable **Work Timer**.

The plugin keeps the time records in `data.json` in the same folder.
