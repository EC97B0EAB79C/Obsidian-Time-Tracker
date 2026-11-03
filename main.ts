import { AbstractInputSuggest, App, ItemView, MarkdownRenderChild, Modal, Notice, Plugin, Setting, WorkspaceLeaf, moment } from "obsidian";

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
    this.registerInterval(window.setInterval(() => this.refresh(), 30000));

    // Summary block in a note: ```work-timer``` with "day" or "week" and an optional date.
    this.registerMarkdownCodeBlockProcessor("work-timer", (src, el, ctx) => {
      const draw = () => {
        const [mode = "day", date] = src.trim().split(/\s+/);
        const name = ctx.sourcePath.split("/").pop()!.replace(/\.md$/, "");
        const m = moment(date ?? name, "YYYY-MM-DD", true);
        const last = (m.isValid() ? m : moment()).startOf("day");
        const first = last.clone().subtract(mode === "week" ? 6 : 0, "days");
        const items = this.data.entries.filter(e =>
          e.start >= first.valueOf() && e.start < last.clone().add(1, "day").valueOf());
        el.empty();
        el.addClass("wt-view");
        const head = el.createDiv({ cls: ["wt-row", "wt-head"] });
        head.createSpan({ text: mode === "week" ? `${first.format("D MMM")} to ${last.format("D MMM")}` : last.format("ddd D MMM") });
        head.createSpan({ text: fmt(sum(items)) });
        tree(this.app, el, items);
      };
      draw();
      this.blocks.add(draw);
      const child = new MarkdownRenderChild(el); // Stops the updates when the block closes.
      child.register(() => this.blocks.delete(draw));
      ctx.addChild(child);
    });
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
    this.app.workspace.getLeavesOfType(VIEW).forEach(l => (l.view as TimerView).render());
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
    // Suggest the names of earlier entries (newest first), then the names of the notes.
    const notes = this.app.vault.getMarkdownFiles().map(f => f.basename);
    const names = (k: "project" | "work") => [...new Set([...entries.map(e => e[k]).reverse(), ...notes])];
    const field = (name: string, value: string, items: string[]) => {
      let input!: HTMLInputElement;
      new Setting(this.contentEl).setName(name).addText(t => { input = t.setValue(value).inputEl; new NameSuggest(this.app, input, items); });
      return input;
    };

    this.titleEl.setText("Start timer");
    const p = field("Project", project, names("project")), w = field("Work", work, names("work"));
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

// Change or delete one entry. "End" is empty only for the timer that runs.
class EditModal extends Modal {
  constructor(app: App, private plugin: WorkTimer, private e: Entry) { super(app); }

  onOpen() {
    const e = this.e, f = "YYYY-MM-DDTHH:mm";
    let { project, work } = e, start = moment(e.start).format(f), end = e.end ? moment(e.end).format(f) : "", sure = false;
    const field = (name: string, value: string, set: (v: string) => void, type = "text") =>
      new Setting(this.contentEl).setName(name).addText(t => { t.inputEl.type = type; t.setValue(value).onChange(set); });

    this.titleEl.setText("Edit entry");
    field("Project", project, v => (project = v));
    field("Work", work, v => (work = v));
    field("Start", start, v => (start = v), "datetime-local");
    field("End", end, v => (end = v), "datetime-local").setDesc(e.end ? "" : "Keep empty to let the timer run.");
    new Setting(this.contentEl)
      .addButton(b => b.setButtonText("Delete").setWarning().onClick(async () => {
        if (!sure) { sure = true; b.setButtonText("Click again to delete"); return; }
        this.plugin.data.entries.remove(e);
        await this.plugin.save();
        this.close();
      }))
      .addButton(b => b.setButtonText("Save").setCta().onClick(async () => {
        const s = moment(start, f, true).valueOf();
        const stop = end ? moment(end, f, true).valueOf() : e.end ? NaN : Date.now();
        if (!project.trim() || !work.trim() || !(stop > s)) return new Notice("Write a project, a work and a correct time.");
        Object.assign(e, { project: project.trim(), work: work.trim(), start: s, end: end ? stop : undefined });
        await this.plugin.save();
        this.close();
      }));
  }

  onClose() { this.contentEl.empty(); }
}

// Suggest the names that contain the text. Before you change the text, suggest all names.
// Obsidian shows the list when the field gets focus or changes.
// Use "#" fields in classes that extend Obsidian classes: a normal field can replace an Obsidian member.
class NameSuggest extends AbstractInputSuggest<string> {
  #names: string[]; #first: string;
  constructor(app: App, input: HTMLInputElement, names: string[]) { super(app, input); this.#names = names; this.#first = input.value; }
  getSuggestions(q: string) { return this.#names.filter(n => q === this.#first || n.toLowerCase().includes(q.toLowerCase())); }
  renderSuggestion(v: string, el: HTMLElement) { el.setText(v); }
  selectSuggestion(v: string) { this.setValue(v); this.close(); }
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
  projects.forEach((pItems, p) => {
    row(app, el, p, sum(pItems), "wt-project");
    const works = new Map<string, number>();
    pItems.forEach(e => works.set(e.work, (works.get(e.work) ?? 0) + dur(e)));
    works.forEach((ms, w) => row(app, el, w, ms, "wt-work"));
  });
}

// If a note has the same name, the name becomes a link to that note.
function row(app: App, el: HTMLElement, name: string, ms: number, cls: string) {
  const r = el.createDiv({ cls: ["wt-row", cls] });
  const n = r.createSpan({ text: name });
  const file = app.metadataCache.getFirstLinkpathDest(name, "");
  if (file) { n.addClass("wt-link"); n.onclick = () => app.workspace.getLeaf().openFile(file); }
  r.createSpan({ text: fmt(ms) });
}
