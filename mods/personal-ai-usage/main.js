import { View, div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { appHome, exec, home, readTextFile, theme } from "herdr";

const sources = [
  { provider: "codex", agent: "Codex", from: { codex: true } },
  { provider: "claude", agent: "Claude", from: { claude: `${home()}/.claude` } },
];

export default class UsageCard extends View {
  init(_props, cx) {
    this.data = {};
    this.busy = false;
    cx.spawn(async cx => this.refresh(cx));
    cx.timer.every(300000, cx => cx.spawn(async cx => this.refresh(cx)));
  }

  async refresh(cx) {
    if (this.busy) return;
    this.busy = true;
    try { await exec("python3", ["-I", `${appHome()}/mods/bettr-usage/report_usage.py`, "--now"], { timeout: 30000 }); } catch {}
    const results = await Promise.all(sources.map(async source => {
      try {
        const snapshot = JSON.parse(await readTextFile(`${home()}/.cache/bettr/usage/${source.provider}.json`));
        if (Date.now() / 1000 - snapshot.updatedAt > 1800) throw new Error("Usage data is older than 30 minutes");
        return { windows: snapshot.windows.filter(w => !w.resetsAt || w.resetsAt * 1000 > Date.now()) };
      } catch (error) { return { error: String(error?.message ?? error) }; }
    }));
    let balance;
    try {
      const result = await exec("python3", ["-I", `${appHome()}/mods/personal-ai-usage/balance.py`], { timeout: 20000 });
      balance = JSON.parse(result.stdout);
    } catch { balance = { error: "Could not check balance" }; }
    this.data = { codex: results[0], claude: results[1], balance };
    this.busy = false;
    cx.notify();
  }

  row(icon, label, value, t) {
    const valid = typeof value === "number" && Number.isFinite(value);
    const percent = valid ? Math.max(0, Math.min(100, Math.round(value))) : 0;
    const filled = Math.round(percent / 10);
    const bar = "█".repeat(filled) + "░".repeat(10 - filled);
    return h_flex().w_full().gap(5).items_center().text_size(11)
      .child(image(icon).size(12).flex_none())
      .child(div().w(52).flex_none().text_color(t.muted).child(label))
      .child(div().flex_1().min_w(0).text_color(valid ? t.accent : t.dim).child(valid ? bar : "──────────"))
      .child(div().w(33).flex_none().text_right().text_color(valid ? t.foreground : t.dim).child(valid ? `${percent}%` : "—"));
  }

  render() {
    const t = theme();
    const find = (provider, period) => this.data[provider]?.windows?.find(w => period === "5h" ? w.label === "5-hour" : w.label === "Weekly")?.used;
    const balance = this.data.balance;
    const amount = balance?.balances?.map(b => `${b.currency} ${b.total}`).join(" · ");
    const details = ["Click to refresh", ...sources.map(s => this.data[s.provider]?.error ? `${s.agent}: ${this.data[s.provider].error}` : ""), balance?.error || ""].filter(Boolean).join("\n");
    return v_flex().id("personal-usage").size_full().p(10).gap(5).bg(t.chrome).overflow_hidden()
      .child(h_flex().id("usage-refresh").w_full().justify_between().cursor_pointer().tooltip(details)
        .on_click((_e, cx) => cx.spawn(async cx => this.refresh(cx)))
        .child(div().font_semibold().text_size(11).text_color(t.foreground).child("AI USAGE"))
        .child(div().text_size(11).text_color(t.dim).child(this.busy ? "..." : "↻")))
      .child(this.row("icons/codex.svg", "7d", find("codex", "7d"), t))
      .child(this.row("icons/claude.svg", "5h", find("claude", "5h"), t))
      .child(this.row("icons/claude.svg", "7d", find("claude", "7d"), t))
      .child(h_flex().w_full().justify_between().gap(4).text_size(11).tooltip(balance?.error ?? "Available API balance")
        .child(h_flex().gap(5).items_center().child(image("mods/personal-ai-usage/deepseek.svg").size(12).flex_none()).child(div().text_color(t.muted).child("DeepSeek")))
        .child(div().text_color(amount ? t.foreground : t.dim).child(amount ?? (balance?.error ? "Unavailable" : "..."))));
  }
}
