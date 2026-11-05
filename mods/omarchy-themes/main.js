// Theme picker, as Omarchy's. omarchy-bar brings the theme's wallpaper.
// ↑/↓ move, Enter picks, Esc closes.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { themes, layouts, settings, shared, run, theme, props, closeOverlay } from "herdr";

const ROW_H = 30;
const SHOWN = 14;

// A theme named like a layout (themes/win98.json) is that layout's own.
const list = () => themes().filter((x) => x.name === shared("layout") || !layouts().includes(x.name));

export default class OmarchyThemes extends View {
  init(_props, cx) {
    this.at = Math.max(0, list().findIndex((x) => x.name === settings().theme));
    this.top = 0;
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(100, () => this.handle.focus());
  }

  pick(name) {
    closeOverlay(props().overlay);
    run("app.theme", { name });
  }

  render() {
    const t = theme();
    const all = list();
    const current = settings().theme;
    const dot = (color) => div().w(8).h(8).bg(color);
    this.top = Math.max(0, Math.min(this.top, this.at, all.length - SHOWN), this.at - SHOWN + 1);
    return v_flex()
      .id("omarchy-themes")
      .track_focus(this.handle)
      .size_full()
      .p(12)
      .bg(t.popover)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") return closeOverlay(props().overlay);
        if (k === "enter") return this.pick(all[this.at]?.name);
        if (k === "down") this.at = Math.min(this.at + 1, all.length - 1);
        else if (k === "up") this.at = Math.max(this.at - 1, 0);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(div().px(10).pb(8).text_size(11).font_semibold().text_color(t.dim).child("Themes"))
      .child(
        v_flex().id("omarchy-themes-rows").on_scroll_wheel((e, cx) => {
          this.top = Math.max(0, Math.min(this.top + (e.delta.y < 0 ? 1 : -1), all.length - SHOWN));
          this.at = Math.max(this.top, Math.min(this.at, this.top + SHOWN - 1));
          cx.notify();
        }).children(all.map(({ name, colors: c }, i) => ({ name, c, i })).slice(this.top, this.top + SHOWN).map(({ name, c, i }) =>
          h_flex()
            .id(`th-${name}`)
            .flex_none()
            .h(ROW_H)
            .px(10)
            .gap(10)
            .items_center()
            .cursor_pointer()
            .text_size(12.8)
            .when(i === this.at, (el) => el.bg(t.selected))
            .hover((s) => s.bg(t.hover))
            .on_click(() => this.pick(name))
            .child(h_flex().flex_none().gap(3).p(4).bg(c.background).border_1().border_color(t.border)
              .child(dot(c.accent)).child(dot(c.ansi1)).child(dot(c.ansi2)).child(dot(c.ansi3)).child(dot(c.ansi5)))
            .child(div().flex_1().min_w(0).text_color(i === this.at ? t.foreground : t.muted).child(name.replace(/-/g, " ")))
            .when(name === current, (el) => el.child(div().text_size(11).text_color(t.accent).child("current"))),
        )),
      );
  }
}
