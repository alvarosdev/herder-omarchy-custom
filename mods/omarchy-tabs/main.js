// auto-tabs: herdr's tab bar (cloned) with wider names; names.js names the tabs.
import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { syncNames } from "./names.js";
import { renderPaneHeader } from "./pane.js";
import { spaces, panes, terminals, props, run, openOverlay, theme, shared, layout } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class Tabs extends View {
  init(_props, cx) {
    this.hovered = false;
    if (_props?.pane) return;
    this.pressed = null;
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    // A remembered panel this space can't show now (Changes outside git) stays remembered.
    if (now === null && this.panels[space.id] && !enabled.includes(this.panels[space.id])) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render() {
    if (props()?.pane) return renderPaneHeader(this);
    syncNames();
    const t = theme();
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const stop = (_e, cx) => cx.stop_propagation();
    const f = t.foreground, idle = f + "0a", hov = f + "14", sel = f + "2e";
    const allPanes = panes(), allTerminals = terminals();
    const item = (c, i) => {
      const tabPanes = allPanes.filter(p => p.tab === c.id);
      const lead = tabPanes.find(p => p.program?.agent && p.status === c.status) ?? tabPanes.find(p => p.program?.agent) ?? tabPanes[0];
      const program = lead?.program;
      const terminal = allTerminals.find(p => p.address === lead?.terminal);
      const report = Object.values(terminal?.records ?? {}).find(r => r.state === c.status && r.title);
      const liveTitle = terminal?.report?.title || report?.title || lead?.title;
      const title = (liveTitle === program?.name ? lead?.branch || liveTitle : liveTitle || "").replace(/^\[[^\]]*\]\s*[^|]*\|\s*/, "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
      const status = { working: "Working", blocked: "Needs input", done: "Done", idle: "Idle" }[c.status];
      // A tab with several agents shows their icons; the person's own tab name wins (names.js records its own names).
      const agentPanes = tabPanes.filter(p => p.program?.agent);
      const programs = [...new Map(agentPanes.map(p => [p.program.name, p.program])).values()];
      const multi = agentPanes.length > 1;
      const personNamed = c.named && shared("tab-titles.set")?.[c.id] !== c.name && !programs.some(p => p.name === c.name);
      // The icons already say which agents run here; the label carries what they work on.
      const isProgram = n => !n || tabPanes.some(p => p.program?.name === n || p.terminal === n) || n === "Claude Code";
      const folder = lead?.cwd ? (/^\/(home\/[^/]+|root)\/?$/.test(lead.cwd) ? "~" : lead.cwd.split("/").filter(Boolean).pop()) : "";
      const work = [title, folder, lead?.branch].find(n => !isProgram(n)) ?? (isProgram(c.name) ? "" : c.name);
      const name = personNamed && !isProgram(c.name) ? c.name : work;
      const detail = multi
        ? agentPanes.map(p => `${p.program.name}: ${({ working: "working", blocked: "needs input", done: "done" })[p.status] ?? "idle"}`).join("\n")
        : [status, c.named && title && title !== c.name ? title : program?.name].filter(Boolean).join(" · ");
      const icons = (multi ? programs.slice(0, 3) : [program]).filter(p => p?.icon);
      return h_flex().id(`tab-${c.id}`).w(240).h_full().px(10).gap(7).rounded(0).items_center().flex_none().text_size(12)
        .tooltip(`${name}\n${detail}`)
        .relative().border_r(1).border_color(t.border)
        .bg(c.active ? sel : idle).text_color(c.active ? t.foreground : t.muted)
        .hover(s => s.bg(c.active ? sel : hov))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .when(icons.length > 0, el => el.child(h_flex().flex_none().gap(6).children(icons.map(p => p.tint ? svg(p.icon).size(14).text_color(t.muted) : image(p.icon).size(14)))))
        .child(div().flex_1().min_w(0).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(Boolean(status), el => el.child(div().flex_none().text_size(10.5).text_color(t[c.status] ?? t.muted).child(status)))
        .when(c.status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(6).rounded(0).bg(t[c.status])))
        .when(c.active, el => el.child(div().id(`close-${c.id}`).flex_none().p(3).rounded(0).text_color(t.dim).hover(s => s.bg(hov).text_color(t.foreground)).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(14))))
        .when(c.active, el => el.child(div().absolute().bottom_0().left_0().right_0().h(2).bg(t.accent)));
    };
    const root = layout();
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = panel && body
      ? [...(shared("workspace.panels") ?? ["files", "changes"]), "graph"].filter(id => Boolean(find(body, id)))
        .filter(id => id !== "changes" || space?.branch != null)
      : [];
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      // Full-height cells like the tabs, so the strip has one rhythm and no odd gaps.
      return h_flex().id(`panel-${id}`).relative().h_full().px(12).gap(6).flex_none().items_center().rounded(0).border_l(1).border_color(t.border)
        .text_size(12).bg(on ? sel : idle).text_color(on ? t.foreground : t.muted)
        .hover(s => s.bg(on ? sel : hov)).on_mouse_down("left", stop)
        .when(on, el => el.child(div().absolute().bottom_0().left_0().right_0().h(2).bg(t.accent)))
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(svg(icon).size(14)).child(label);
    };
    return h_flex().size_full().min_w(0).gap(0).items_center().bg(t.chrome)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").max_w(shown.length * 241).flex_shrink(1).min_w(0).h_full().items_center().gap(0).overflow_x_scrollbar().children(shown.map(item)))
      .child(div().id("tab-new").h_full().w(36).flex_none().flex().items_center().justify_center().rounded(0).border_r(1).border_color(t.border).bg(idle).text_color(t.dim)
        .hover(s => s.bg(hov).text_color(t.foreground)).on_mouse_down("left", stop)
        .on_click(() => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })).child("+"))
      .child(div().flex_1())
      .child(h_flex().h_full().gap(0).items_center().flex_none()
      .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/files/file.svg")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))
      .when(enabled.includes("graph"), el => el.child(panelButton("graph", "Git", "mods/omarchy-tabs/icons/graph.svg"))));
  }
}
