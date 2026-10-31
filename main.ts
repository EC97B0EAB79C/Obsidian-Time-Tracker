import { App, ItemView, Modal, Notice, Plugin, Setting, WorkspaceLeaf, moment } from "obsidian";

interface Entry { project: string; work: string; start: number; end?: number; }
interface Data { entries: Entry[]; }

const VIEW = "work-timer-view";
const fmt = (ms: number) => { const m = Math.round(ms / 60000); return `${Math.floor(m / 60)}h ${m % 60}m`; };
const dur = (e: Entry) => (e.end ?? Date.now()) - e.start;
const dayStart = (t: number) => new Date(t).setHours(0, 0, 0, 0);
const sum = (items: Entry[]) => items.reduce((s, e) => s + dur(e), 0);

export default class WorkTimer extends Plugin {
  data: Data = { entries: [] };
  status!: HTMLElement;

  get active() { return this.data.entries.find(e => !e.end); }

  async onload() {
    this.data = Object.assign({ entries: [] }, await this.loadData());
    this.status = this.addStatusBarItem();
    this.registerView(VIEW, leaf => new TimerView(leaf, this));
    this.addRibbonIcon("timer", "Open work timer", () => this.openView());
    this.addCommand({ id: "start", name: "Start timer", callback: () => new StartModal(this.app, this).open() });
    this.addCommand({ id: "stop", name: "Stop timer", callback: () => this.stop() });
    this.addCommand({ id: "open", name: "Open view", callback: () => this.openView() });
    this.registerInterval(window.setInterval(() => this.refresh(), 30000));
    this.refresh();

    // Summary block in a note: ```work-timer``` with "day" or "week" and an optional date.
    this.registerMarkdownCodeBlockProcessor("work-timer", (src, el, ctx) => {
      const [mode = "day", date] = src.trim().split(/\s+/);
      const name = ctx.sourcePath.split("/").pop()!.replace(/\.md$/, "");
      const m = moment(date ?? name, "YYYY-MM-DD", true);
      const last = (m.isValid() ? m : moment()).startOf("day");
      const first = last.clone().subtract(mode === "week" ? 6 : 0, "days");
      const items = this.data.entries.filter(e =>
        e.start >= first.valueOf() && e.start < last.clone().add(1, "day").valueOf());
      el.addClass("wt-view");
      const head = el.createDiv({ cls: ["wt-row", "wt-head"] });
      head.createSpan({ text: mode === "week" ? `${first.format("D MMM")} to ${last.format("D MMM")}` : last.format("ddd D MMM") });
      head.createSpan({ text: fmt(sum(items)) });
      tree(this.app, el, items);
    });
  }

  async start(project: string, work: string) {
    await this.stop(true); // Only one timer runs at a time.
    this.data.entries.push({ project, work, start: Date.now() });
    await this.save();
    new Notice(`Started: ${project} / ${work}`);
  }

  async stop(silent = false) {
    const e = this.active;
    if (!e) { if (!silent) new Notice("No timer runs."); return; }
    e.end = Date.now();
    await this.save();
    if (!silent) new Notice(`Stopped: ${fmt(dur(e))}`);
  }

  async save() { await this.saveData(this.data); this.refresh(); }

  refresh() {
    const e = this.active;
    this.status.setText(e ? `⏱ ${e.project} / ${e.work} ${fmt(dur(e))}` : "");
    this.app.workspace.getLeavesOfType(VIEW).forEach(l => (l.view as TimerView).render());
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
    // Fill from the frontmatter of the open note, if it has "project" or "work".
    const file = this.app.workspace.getActiveFile();
    const fm = file ? this.app.metadataCache.getFileCache(file)?.frontmatter : undefined;
    let project: string = fm?.project ?? "", work: string = fm?.work ?? "";
    const names = (k: "project" | "work") => [...new Set(this.plugin.data.entries.map(e => e[k]))];

    this.titleEl.setText("Start timer");
    new Setting(this.contentEl).setName("Project").addText(t => {
      t.setValue(project).onChange(v => (project = v));
      suggest(t.inputEl, names("project"), "wt-projects");
    });
    new Setting(this.contentEl).setName("Work").addText(t => {
      t.setValue(work).onChange(v => (work = v));
      suggest(t.inputEl, names("work"), "wt-works");
    });
    new Setting(this.contentEl).addButton(b => b.setButtonText("Start").setCta().onClick(async () => {
      if (!project.trim() || !work.trim()) return new Notice("Write a project and a work.");
      await this.plugin.start(project.trim(), work.trim());
      this.close();
    }));
  }

  onClose() { this.contentEl.empty(); }
}

function suggest(input: HTMLInputElement, items: string[], id: string) {
  const list = input.parentElement!.createEl("datalist", { attr: { id } });
  items.forEach(i => list.createEl("option", { attr: { value: i } }));
  input.setAttr("list", id);
}

class TimerView extends ItemView {
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
      box.open = i === 0;
      const s = box.createEl("summary");
      s.createSpan({ text: i === 0 ? "Today" : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) });
      s.createSpan({ text: fmt(sum(items)) });
      tree(this.app, box, items);
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
