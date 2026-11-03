# Obsidian Time Tracker

An Obsidian plugin that records the time you use for each project and work.

## Features

- Start and stop a timer. Only one timer runs at a time.
- The status bar shows the timer that runs.
- A side view shows the totals for the last 7 days and for all projects.
- In the side view, click an entry to change its project, work, start or end. You can also delete the entry.
- A code block in a note shows the totals for a day or a week. The totals update while the timer runs.
- If a note has the same name as a project or a work, the name is a link to that note.
- If Obsidian Sync changes the time records from a different device, the plugin reads them again.

## Start dialog

- The dialog fills in the project and the work:
  - If the open note has `project` or `work` in its frontmatter, the dialog uses these values. A value can be text or a link, for example `project: "[[Alpha]]"`.
  - If not, the dialog uses the project and the work of the previous entry.
- The project text is selected. Type to replace it, or press Tab to go to the work.
- When a field gets focus, a list shows the earlier names (newest first) and the note names. Type to make the list shorter.
- Press Enter to select a name from the list. When the list is closed, press Enter to start the timer.

## Correct an entry

The timer continues when Obsidian is closed. If you forget to stop the timer, do these steps:

1. Open the side view.
2. Open the day when the timer started.
3. Click the entry. Its end shows as "now".
4. Set the correct **End** time.
5. Click **Save**.

To delete an entry, click **Delete**, then click **Click again to delete**.

## Commands

- **Start timer**: Open the dialog. Write a project and a work, then press Enter or click **Start**.
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

### Time for a project or a work

Add a `project:` line, a `work:` line, or both:

````
```work-timer
project: Alpha
```
````

- `project: Alpha` shows the total time of the project and the time of each work in it.
- `project: Alpha` and `work: Design` show only the time of the work "Design" in the project "Alpha".
- `work: Design` (with no project) shows the time of this work in each project.
- The name must be the same as in the entries, with the same upper-case and lower-case letters. You can also write a link, for example `project: [[Alpha]]`.
- These blocks show all time. To show only one day or one week, also add a `day` or `week` line, for example `week 2026-10-31`.

## Install

### From a release

1. Open the [latest release](https://github.com/EC97B0EAB79C/Obsidian-Time-Tracker/releases/latest).
2. Download `work-timer-<version>.zip`, for example `work-timer-0.2.0.zip`.
3. Extract the zip into `<vault>/.obsidian/plugins/`. This makes the folder `work-timer` with 3 files. The `.obsidian` folder is hidden. Show hidden files to see it.
4. Restart Obsidian.
5. Open **Settings > Community plugins**. If **Restricted mode** is on, turn it off.
6. Enable **Work Timer**.

To update the plugin, extract the zip from a newer release into the same location. The zip does not replace `data.json`, so your time records stay.

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
3. Push a tag with the same version, for example `0.2.1`. Do not use a `v` before the number.

GitHub Actions then builds the plugin and makes a release with `main.js`, `manifest.json`, `styles.css` and `work-timer-<version>.zip`. Obsidian and BRAT use the 3 files. The zip is for manual install. If the tag and the version in `manifest.json` are different, the workflow stops and makes no release.
