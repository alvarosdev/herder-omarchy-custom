// Every key binding Herdr has (keys()), grouped by where it works.
// Type to filter by key or action; Esc closes.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { keys, theme, shared, props, closeOverlay } from "herdr";

// The shown layout's own keys win over global ones, so they come first.
function title(section, layout) {
  if (section === `layout:${layout}`) return "This layout";
  if (section === "global") return "Everywhere";
  if (section === "terminal") return "In a terminal";
  const [kind, name] = section.split(":");
  return kind === "layout" ? `Layout ${name}` : kind === "mod" ? `Mod ${name}` : section;
}

// "ctrl-shift-p" -> ["ctrl", "shift", "p"]; "ctrl--" -> ["ctrl", "-"].
const keyParts = (k) => (k.endsWith("--") ? [...k.slice(0, -2).split("-"), "-"] : k.split("-"));

export default class OmarchyKeys extends View {
  init(_props, cx) {
    this.query = "";
    this.input = InputState.new({ placeholder: "Filter keys or actions…" });
    this.input.on("change", (_e, cx) => { this.query = this.input.value().trim().toLowerCase(); cx.notify(); });
    this.input.focus();
    cx.timer.after(100, () => this.input.focus());
  }

  render() {
    const t = theme(), layout = shared("layout"), q = this.query;
    const all = keys().filter((k) => !q || k.keys.toLowerCase().includes(q) || k.action.toLowerCase().includes(q));
    const own = new Set(all.filter((k) => k.section === `layout:${layout}`).map((k) => k.keys));
    const sections = [...new Set(all.map((k) => k.section))]
      .sort((a, b) => (a === `layout:${layout}` ? -1 : b === `layout:${layout}` ? 1 : 0));
    const chip = (p) => div().px(5).border_1().border_color(t.border).bg(t.raised).text_size(11).text_color(t.foreground).child(p);
    return v_flex().id("omarchy-keys").size_full().min_h(0).p(16).gap(10).bg(t.popover).text_color(t.foreground)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); } })
      .child(h_flex().h(34).flex_none().px(10).gap(10).items_center().border_1().border_color(t.accent).bg(t.background)
        .child(svg("mods/omarchy-keys/keyboard.svg").size(15).text_color(t.dim))
        .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground))
        .child(div().text_size(11).text_color(t.dim).child(`${all.length} keys · Esc`)))
      .child(v_flex().id("omarchy-keys-list").flex_1().min_h(0).overflow_y_scrollbar()
        .when(!all.length, (e) => e.child(div().p(10).text_size(12.5).text_color(t.dim).child(`No key matches "${this.query}"`)))
        .children(sections.flatMap((section) => [
          div().id(`ks-${section}`).h(28).flex_none().px(10).flex().items_end().pb(4).text_size(11).font_semibold().text_color(t.dim).child(title(section, layout).toUpperCase()),
          ...all.filter((k) => k.section === section).map((k, i) => {
            // A global key this layout binds too does the layout's action here.
            const shadowed = section === "global" && own.has(k.keys);
            return h_flex().id(`k-${section}-${i}`).h(28).flex_none().px(10).gap(12).items_center().hover((s) => s.bg(t.hover))
              .child(h_flex().w(200).flex_none().gap(3).children(keyParts(k.keys).map(chip)))
              .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(shadowed ? t.dim : t.muted).child(k.action))
              .when(shadowed, (e) => e.child(div().flex_none().text_size(11).text_color(t.dim).child("overridden here")));
          }),
        ])));
  }
}
