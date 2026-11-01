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

## Install

### From a release

1. Open the [latest release](https://github.com/EC97B0EAB79C/Obsidian-Time-Tracker/releases/latest).
2. Download `main.js`, `manifest.json` and `styles.css`.
3. Make the folder `<vault>/.obsidian/plugins/work-timer/`. The `.obsidian` folder is hidden. Show hidden files to see it.
4. Put the 3 files in this folder.
5. Restart Obsidian.
6. Open **Settings > Community plugins**. If **Restricted mode** is on, turn it off.
7. Enable **Work Timer**.

To update the plugin, replace the 3 files with the files from a newer release.

### With BRAT

[BRAT](https://github.com/TfTHacker/obsidian42-brat) installs the plugin and gets the updates for you.

1. Install and enable the **BRAT** community plugin.
2. In the BRAT settings, click **Add beta plugin**.
3. Write `EC97B0EAB79C/Obsidian-Time-Tracker` and click **Add plugin**.
4. Enable **Work Timer** in **Settings > Community plugins**.

The plugin keeps the time records in `data.json` in its plugin folder.

## Build

```bash
npm install
```

```bash
npm run build
```

This makes `main.js`. Use `npm run dev` to build again each time you change `main.ts`.

## Release

1. Set the new version in `manifest.json`, `package.json` and `versions.json`.
2. Push the changes.
3. Push a tag with the same version, for example `1.0.1`. Do not use a `v` before the number.

GitHub Actions then builds the plugin and makes a release with `main.js`, `manifest.json` and `styles.css`.
