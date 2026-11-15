import {
  AbstractInputSuggest, App, ItemView, MarkdownRenderChild, Modal, Notice, Plugin, SearchResult, Setting, TFile, WorkspaceLeaf,
  moment, prepareFuzzySearch, renderResults, sortSearchResults,
} from "obsidian";

interface Entry { project: string; work: string; start: number; end?: number; }
interface Data { entries: Entry[]; }

const VIEW = "work-timer-view";
const fmt = (ms: number) => { const m = Math.round(ms / 60000); return `${Math.floor(m / 60)}h ${m % 60}m`; };
const dur = (e: Entry) => (e.end ?? Date.now()) - e.start;
const dayStart = (t: number) => new Date(t).setHours(0, 0, 0, 0);
const sum = (items: Entry[]) => items.reduce((s, e) => s + dur(e), 0);
const time = (t: number) => moment(t).format("LT");
// Frontmatter can hold a number, a list or a link. Get the plain text.
const text = (v: unknown) => String([v].flat(2)[0] ?? "").replace(/^\[\[([^|\]]*).*\]\]$/, "$1");

export default class WorkTimer extends Plugin {
  data: Data = { entries: [] };
  status!: HTMLElement;
  blocks = new Set<() => void>(); // Code blocks to draw again in refresh().

  get active() { return this.data.entries.find(e => !e.end); }

  // Obsidian calls onExternalSettingsChange() when Sync changes data.json.
  async loadEntries() { this.data = Object.assign({ entries: [] }, await this.loadData()); this.refresh(); }
  onExternalSettingsChange() { return this.loadEntries(); }

  async onload() {
    this.status = this.addStatusBarItem();
    await this.loadEntries();
    this.registerView(VIEW, leaf => new TimerView(leaf, this));
    this.addRibbonIcon("timer", "Open work timer", () => this.openView());
    this.addCommand({ id: "start", name: "Start timer", callback: () => new StartModal(this.app, this).open() });
    this.addCommand({ id: "stop", name: "Stop timer", callback: () => this.stop() });
    this.addCommand({ id: "open", name: "Open view", callback: () => this.openView() });
    this.addCommand({ id: "add", name: "Add time record", callback: () => this.addRecord() });
    this.registerInterval(window.setInterval(() => this.refresh(), 30000));

    // When a note is renamed, the entries with its old name as project or work get the new name.
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      const old = oldPath.split("/").pop()!.replace(/\.md$/, "");
      if (!(file instanceof TFile) || file.extension !== "md" || !oldPath.endsWith(".md") || file.basename === old) return;
      let n = 0;
      for (const e of this.data.entries) {
        if (e.project === old || e.work === old) n++;
        if (e.project === old) e.project = file.basename;
        if (e.work === old) e.work = file.basename;
      }
      if (!n) return;
      this.save();
      new Notice(`Changed "${old}" to "${file.basename}" in ${n} ${n === 1 ? "entry" : "entries"}.`);
    }));

    // Summary block in a note: ```work-timer```. The lines "project: X" and "work: Y" select the entries.
    // Other text is the period: "day" or "week" and an optional date. With a project or a work and no period, show all time.
    this.registerMarkdownCodeBlockProcessor("work-timer", (src, el, ctx) => {
      const draw = () => {
        const f: Record<string, string | undefined> = {};
        const period = src.replace(/^\s*(project|work)\s*:(.*)$/gim, (_, k: string, v: string) => {
          f[k.toLowerCase()] = text(v.trim().replace(/^(["'])(.*)\1$/, "$2")); // Also accept "Name" and [[Name]].
          return "";
        }).trim();
        const by = f.project || f.work;
        let items = this.data.entries.filter(e => (!f.project || e.project === f.project) && (!f.work || e.work === f.work));
        let label = by ?? "";
        if (period || !by) {
          const [mode, date] = period.split(/\s+/);
          const name = ctx.sourcePath.split("/").pop()!.replace(/\.md$/, "");
          const m = moment(date ?? name, "YYYY-MM-DD", true);
          const last = (m.isValid() ? m : moment()).startOf("day");
          const first = last.clone().subtract(mode === "week" ? 6 : 0, "days");
          items = items.filter(e => e.start >= first.valueOf() && e.start < last.clone().add(1, "day").valueOf());
          label = [by, mode === "week" ? `${first.format("D MMM")} to ${last.format("D MMM")}` : last.format("ddd D MMM")].filter(Boolean).join(" · ");
        }
        el.empty();
        el.addClass("wt-view");
        row(this.app, el, label, sum(items), "wt-head", label === by); // A date in the label is not a link.
        if (by) rows(this.app, el, items, f.project ? "work" : "project"); // Project: each work. Work only: each project.
        else tree(this.app, el, items);
      };
      draw();
      this.blocks.add(draw);
      const child = new MarkdownRenderChild(el); // Stops the updates when the block closes.
      child.register(() => this.blocks.delete(draw));
      ctx.addChild(child);
    });
  }

  // Add time that the timer did not record. The dialog fills in the previous project and work, and the last hour.
  // The record is added only when you click Save.
  addRecord() {
    const last = this.data.entries[this.data.entries.length - 1], end = Math.floor(Date.now() / 60000) * 60000;
    new EditModal(this.app, this, { project: last?.project ?? "", work: last?.work ?? "", start: end - 3600000, end }).open();
  }

  async start(project: string, work: string) {
    const a = this.active;
    if (a) a.end = Date.now(); // Only one timer runs at a time. No "await" before the push, so 2 fast calls cannot start 2 timers.
    this.data.entries.push({ project, work, start: Date.now() });
    await this.save();
    new Notice(`Started: ${project} / ${work}`);
  }

  async stop() {
    const e = this.active;
    if (!e) return new Notice("No timer runs.");
    e.end = Date.now();
    await this.save();
    new Notice(`Stopped: ${fmt(dur(e))}`);
  }

  async save() { await this.saveData(this.data); this.refresh(); }

  refresh() {
    const e = this.active;
    this.status.setText(e ? `⏱ ${e.project} / ${e.work} ${fmt(dur(e))}` : "");
    // A leaf of this type can hold a placeholder: a DeferredView while it is hidden, or an unknown view
    // while the plugin is off. Only a real TimerView has render().
    this.app.workspace.getLeavesOfType(VIEW).forEach(l => { if (l.view instanceof TimerView) l.view.render(); });
    this.blocks.forEach(draw => draw());
  }

  async openView() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false)!;
      await leaf.setViewState({ type: VIEW, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
  }
}

class StartModal extends Modal {
  constructor(app: App, private plugin: WorkTimer) { super(app); }

  onOpen() {
    // Fill from the frontmatter of the open note. If it has no values, fill from the previous entry.
    const file = this.app.workspace.getActiveFile();
    const fm = file ? this.app.metadataCache.getFileCache(file)?.frontmatter : undefined;
    const entries = this.plugin.data.entries, last = entries[entries.length - 1];
    const project = text(fm?.project) || last?.project || "";
    const work = text(fm?.work) || (project === last?.project ? last.work : "");

    this.titleEl.setText("Start timer");
    const p = field(this.contentEl, "Project", project), w = field(this.contentEl, "Work", work);
    new NameSuggest(this.app, p, entries, "project");
    new NameSuggest(this.app, w, entries, "work");
    const start = () => {
      const [pv, wv] = [p.value.trim(), w.value.trim()];
      if (!pv || !wv) return new Notice("Write a project and a work.");
      this.close(); // Close first, so a second click or Enter cannot start a second timer.
      this.plugin.start(pv, wv);
    };
    new Setting(this.contentEl).addButton(b => b.setButtonText("Start").setCta().onClick(start));
    this.scope.register([], "Enter", e => { if (!e.isComposing) { start(); return false; } });
    p.focus();
    p.select(); // Selected text is easy to replace.
  }

  onClose() { this.contentEl.empty(); }
}

// Add, change or delete one entry. "End" is empty only for the timer that runs.
// An entry that is not in the list yet is a new record: no Delete button, and Save adds it.
class EditModal extends Modal {
  constructor(app: App, private plugin: WorkTimer, private e: Entry) { super(app); }

  onOpen() {
    const e = this.e, entries = this.plugin.data.entries, el = this.contentEl, f = "YYYY-MM-DDTHH:mm";
    const isNew = !entries.includes(e);
    let sure = false;

    this.titleEl.setText(isNew ? "Add time record" : "Edit entry");
    const p = field(el, "Project", e.project), w = field(el, "Work", e.work);
    new NameSuggest(this.app, p, entries, "project");
    new NameSuggest(this.app, w, entries, "work");
    const start = field(el, "Start", moment(e.start).format(f), "datetime-local");
    const end = field(el, "End", e.end ? moment(e.end).format(f) : "", "datetime-local", e.end ? "" : "Keep empty to let the timer run.");
    const buttons = new Setting(el);
    if (!isNew) buttons.addButton(b => b.setButtonText("Delete").setWarning().onClick(async () => {
      if (!sure) { sure = true; b.setButtonText("Click again to delete"); return; }
      entries.remove(e);
      await this.plugin.save();
      this.close();
    }));
    buttons.addButton(b => b.setButtonText("Save").setCta().onClick(async () => {
      // Read the fields now: a name selected from the list does not send a change event.
      const [project, work] = [p.value.trim(), w.value.trim()];
      const s = moment(start.value, f, true).valueOf();
      const stop = end.value ? moment(end.value, f, true).valueOf() : e.end ? NaN : Date.now();
      if (!project || !work || !(stop > s)) return new Notice("Write a project, a work and a correct time.");
      Object.assign(e, { project, work, start: s, end: end.value ? stop : undefined });
      if (isNew) entries.push(e);
      await this.plugin.save();
      this.close();
    }));
  }

  onClose() { this.contentEl.empty(); }
}

// A text field in a modal. Returns its input.
function field(el: HTMLElement, name: string, value: string, type = "text", desc = "") {
  let input!: HTMLInputElement;
  new Setting(el).setName(name).setDesc(desc).addText(t => { t.inputEl.type = type; input = t.setValue(value).inputEl; });
  return input;
}

// Before you type (empty or filled-in text), suggest the recent names.
// When you type, suggest the note names that match, with the same fuzzy search as the file switcher. The best match is first.
// Obsidian shows the list when the field gets focus or changes.
// Use "#" fields in classes that extend Obsidian classes: a normal field can replace an Obsidian member.
type Suggestion = { name: string; match?: SearchResult };
class NameSuggest extends AbstractInputSuggest<Suggestion> {
  #recent: string[]; #first: string;
  constructor(app: App, input: HTMLInputElement, entries: Entry[], key: "project" | "work") {
    super(app, input);
    this.#recent = [...new Set(entries.map(e => e[key]).reverse())]; // Newest first.
    this.#first = input.value;
  }
  getSuggestions(q: string): Suggestion[] {
    if (!q.trim() || q === this.#first) return this.#recent.map(name => ({ name }));
    const search = prepareFuzzySearch(q.trim());
    const notes = [...new Set(this.app.vault.getMarkdownFiles().map(f => f.basename))];
    const found = notes.flatMap(name => { const match = search(name); return match ? [{ name, match }] : []; });
    sortSearchResults(found);
    return found;
  }
  renderSuggestion(s: Suggestion, el: HTMLElement) { if (s.match) renderResults(el, s.name, s.match); else el.setText(s.name); }
  selectSuggestion(s: Suggestion) { this.setValue(s.name); this.close(); }
}

class TimerView extends ItemView {
  #days = new Map<number, boolean>(); // Keeps the open days when the view draws again.
  constructor(leaf: WorkspaceLeaf, private plugin: WorkTimer) { super(leaf); }
  getViewType() { return VIEW; }
  getDisplayText() { return "Work timer"; }
  getIcon() { return "timer"; }
  async onOpen() { this.render(); }

  render() {
    const el = this.contentEl, all = this.plugin.data.entries, a = this.plugin.active;
    el.empty();
    el.addClass("wt-view");

    const bar = el.createDiv("wt-bar");
    bar.createSpan({ text: a ? `${a.project} / ${a.work}: ${fmt(dur(a))}` : "No timer runs." });
    bar.createEl("button", { text: "Add", attr: { "aria-label": "Add time record" } }).onclick = () => this.plugin.addRecord();
    bar.createEl("button", { text: a ? "Stop" : "Start" }).onclick = () =>
      a ? this.plugin.stop() : new StartModal(this.app, this.plugin).open();

    el.createEl("h4", { text: "Last 7 days" });
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const items = all.filter(e => dayStart(e.start) === d.getTime());
      const box = el.createEl("details", { cls: "wt-day" });
      const t = d.getTime();
      box.open = this.#days.get(t) ?? i === 0;
      box.ontoggle = () => this.#days.set(t, box.open);
      const s = box.createEl("summary");
      s.createSpan({ text: i === 0 ? "Today" : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) });
      s.createSpan({ text: fmt(sum(items)) });
      tree(this.app, box, items);
      // Each entry of the day. Click an entry to edit or delete it.
      [...items].sort((x, y) => x.start - y.start).forEach(e => {
        const r = box.createDiv({ cls: ["wt-row", "wt-entry"] });
        r.createSpan({ text: `${time(e.start)} – ${e.end ? time(e.end) : "now"} ${e.project} / ${e.work}` });
        r.createSpan({ text: fmt(dur(e)) });
        r.onclick = () => new EditModal(this.app, this.plugin, e).open();
      });
    }

    el.createEl("h4", { text: "All projects" });
    tree(this.app, el, all);
  }
}

// Show each project with its total, then each work with its total.
function tree(app: App, el: HTMLElement, items: Entry[]) {
  if (!items.length) { el.createDiv({ cls: "wt-empty", text: "No time recorded." }); return; }
  const projects = new Map<string, Entry[]>();
  items.forEach(e => projects.set(e.project, [...(projects.get(e.project) ?? []), e]));
  projects.forEach((pItems, p) => { row(app, el, p, sum(pItems), "wt-project"); rows(app, el, pItems, "work"); });
}

// One indented row for each project or work, with its total.
function rows(app: App, el: HTMLElement, items: Entry[], key: "project" | "work") {
  if (!items.length) { el.createDiv({ cls: "wt-empty", text: "No time recorded." }); return; }
  const totals = new Map<string, number>();
  items.forEach(e => totals.set(e[key], (totals.get(e[key]) ?? 0) + dur(e)));
  totals.forEach((ms, n) => row(app, el, n, ms, "wt-work"));
}

// The name is a link to the note with the same name. If there is no note, it looks like an unresolved link,
// and a click makes the note (like a click on an unresolved link). A name that cannot be a file name is plain text.
function row(app: App, el: HTMLElement, name: string, ms: number, cls: string, link = true) {
  const r = el.createDiv({ cls: ["wt-row", cls] });
  const n = r.createSpan({ text: name });
  if (link && name && !/[\\/:*?"<>|#^[\]]/.test(name)) {
    n.addClass("wt-link");
    if (!app.metadataCache.getFirstLinkpathDest(name, "")) n.addClass("is-unresolved");
    n.onclick = () => app.workspace.openLinkText(name, "");
  }
  r.createSpan({ text: fmt(ms) });
}
