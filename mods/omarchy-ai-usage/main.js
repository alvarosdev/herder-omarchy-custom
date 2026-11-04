import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, exec, focused, home, panes, readTextFile, shared, setShared, props, openOverlay, settings, theme } from "herdr";

const MOD = "omarchy-ai-usage";
const keyOf = id => `${MOD}.${id}`;
const SHOWN = keyOf("shown");
const EVERY = 5 * 60e3;
// One missed cycle plus slack, so a slow fetch doesn't flash the bar grey.
const STALE = 12 * 60e3;
const AMBER = "#ffb347", RED = "#ff5d6c";
const POPUP_W = 300, GAP = 6;
const H = 3600e3, DAY = 24 * H;

const json = async path => {
  try { return JSON.parse((await readTextFile(path.startsWith("/") ? path : `${home()}/${path}`)) ?? "null"); } catch { return null; }
};
const isoOf = ms => (ms ? new Date(ms).toISOString() : null);
const spanName = s => (s >= 7 * DAY ? "Weekly limit" : `${Math.round(s / H)}-hour limit`);
const spanShort = s => (s >= DAY ? `${Math.round(s / DAY)}d` : `${Math.round(s / H)}h`);
const win = (span, used, resetsAt, extra) => ({ short: spanShort(span), long: spanName(span), span, used: Math.round(used), resets_at: resetsAt, ...extra });

// Quota endpoints, each on the provider's own host. `creds` never leaves fetch time.
const PROVIDERS = {
  claude: {
    name: "Claude",
    async usage(c) {
      const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
        headers: { Authorization: `Bearer ${c.token}`, "anthropic-beta": "oauth-2025-04-20", Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const span = { session: 5 * H, weekly_all: 7 * DAY, weekly_scoped: 7 * DAY };
      if (Array.isArray(data.limits)) {
        return data.limits.filter(l => span[l.kind]).map(l => {
          const model = l.scope?.model?.display_name;
          const w = win(span[l.kind], l.percent, l.resets_at);
          return model ? { ...w, short: `7d ${model}`, long: `Weekly ${model} limit` } : w;
        });
      }
      return [["five_hour", 5 * H], ["seven_day", 7 * DAY]]
        .filter(([k]) => typeof data[k]?.utilization === "number")
        .map(([k, s]) => win(s, data[k].utilization, data[k].resets_at));
    },
  },
  codex: {
    name: "Codex",
    async usage(c) {
      const res = await fetch("https://chatgpt.com/backend-api/wham/usage", {
        headers: { Authorization: `Bearer ${c.token}`, "ChatGPT-Account-Id": c.account ?? "", Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rl = (await res.json()).rate_limit ?? {};
      return [rl.primary_window, rl.secondary_window].filter(w => w && typeof w.used_percent === "number")
        .map(w => win(w.limit_window_seconds * 1e3, w.used_percent, isoOf(w.reset_at * 1e3)));
    },
  },
  copilot: {
    name: "Copilot",
    async usage(c) {
      const res = await fetch("https://api.github.com/copilot_internal/user", {
        headers: { Authorization: `token ${c.token}`, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const label = { premium_interactions: "premium", chat: "chat", completions: "completions" };
      return Object.entries(data.quota_snapshots ?? {}).filter(([k, q]) => label[k] && !q.unlimited)
        .map(([k, q]) => win(30 * DAY, 100 - q.percent_remaining, data.quota_reset_date_utc,
          { short: k === "premium_interactions" ? "mo" : label[k], long: `Monthly ${label[k]} requests`, monthly: true }));
    },
  },
};

// Multi-provider harnesses: which provider they use, and where their logins live.
const HARNESS = {
  pi: { auth: ".pi/agent/auth.json", pick: async () => (await json(".pi/agent/settings.json"))?.defaultProvider },
  opencode: { auth: ".local/share/opencode/auth.json", pick: async () => (await json(".config/opencode/opencode.json"))?.model?.split("/")[0] },
};
const UNDER = { anthropic: "claude", "openai-codex": "codex", openai: "codex", "github-copilot": "copilot" };

// Rebuilt from the plain source record each fetch, so the popup copy can refresh too.
async function creds(src) {
  const f = src.from;
  if (f.claude) {
    const o = (await json(`${f.claude}/.credentials.json`))?.claudeAiOauth;
    if (!o?.accessToken) throw new Error(`no Claude Code login in ${f.claude.replace(home(), "~")}`);
    return { token: o.accessToken, expires: o.expiresAt };
  }
  if (f.codex) {
    const t = (await json(".codex/auth.json"))?.tokens;
    if (!t?.access_token) throw new Error("no Codex ChatGPT login in ~/.codex");
    return { token: t.access_token, account: t.account_id };
  }
  if (f.copilot) {
    const gh = (await json(".config/github-copilot/oauth.json"))?.["https://github.com/login/oauth"]?.[0]?.accessToken;
    const apps = Object.values({ ...(await json(".config/github-copilot/hosts.json")), ...(await json(".config/github-copilot/apps.json")) });
    const token = gh ?? apps.find(a => a?.oauth_token)?.oauth_token;
    if (!token) throw new Error("no GitHub Copilot login in ~/.config/github-copilot");
    return { token };
  }
  const e = (await json(HARNESS[f.harness].auth))?.[f.entry];
  if (e?.type !== "oauth") throw new Error(`no ${f.entry} login in ${f.harness}`);
  return { token: src.provider === "copilot" ? e.refresh : e.access, account: e.accountId, expires: e.expires };
}

async function refreshOne(src) {
  if (!src.provider) return;
  const prev = shared(keyOf(src.id)) ?? {};
  const now = new Date().toISOString();
  try {
    const c = await creds(src);
    if (c.expires && c.expires < Date.now()) throw new Error(`token expired, use ${src.agent} to refresh it`);
    setShared(keyOf(src.id), { checked: now, fetched: now, error: null, windows: await PROVIDERS[src.provider].usage(c) });
  } catch (e) {
    setShared(keyOf(src.id), { ...prev, checked: now, error: String(e?.message ?? e) });
  }
}

const shownList = () => shared(SHOWN)?.list ?? [];
const due = src => src.provider && Date.now() - (Date.parse(shared(keyOf(src.id))?.checked ?? "") || 0) >= EVERY;
const refreshAll = (force) => Promise.all(shownList().filter(s => force || due(s)).map(refreshOne));
const isStale = u => !u?.fetched || Boolean(u.error) || Date.now() - Date.parse(u.fetched) > STALE;

// Agent terminals the person sees now, the focused one first. A zoomed pane hides the rest.
function visible() {
  const f = focused();
  if (!f) return [];
  let ps = panes().filter(p => p.tab === f.tab && p.terminal && p.program?.agent);
  if (ps.some(p => p.zoomed)) ps = ps.filter(p => p.zoomed);
  const list = ps.map(p => ({ terminal: p.terminal, program: p.program, focused: p.focused }));
  const block = f.terminal && !list.some(v => v.terminal === f.terminal) && agents().find(a => a.address === f.terminal);
  if (block) list.push({ terminal: block.address, program: block.program, focused: true });
  return list.sort((a, b) => b.focused - a.focused);
}

const claudeDirs = [".claude", ".claude-personal"];
const claudeLabel = dir => (dir.split("/").pop().replace(/^\.claude-?/, "") || "claude");

function labelled(v, why) {
  return { id: `none.${v.program.key}`, agent: v.program.name, label: v.program.name, icon: v.program.icon, tint: v.program.tint, note: why ?? "no usage API" };
}

export default class AiUsage extends View {
  init(_props, cx) {
    if (props()?.overlay) return;
    this.sig = null;
    this.claudeEnv = {};
    cx.timer.every(60e3, cx => { cx.spawn(async () => refreshAll()); cx.notify(); });
  }

  // CLAUDE_CONFIG_DIR is per process; Linux /proc ties it to the Herdr terminal (HC_TERMINAL_ID).
  async claudeDirOf(terminal) {
    if (!(terminal in this.claudeEnv)) {
      const r = await exec("sh", ["-c", `for f in /proc/[0-9]*/environ; do tr '\\0' '\\n' < "$f" 2>/dev/null | awk -F= '/^HC_TERMINAL_ID=/{t=$2} /^CLAUDE_CONFIG_DIR=/{c=$2} END{if(t!="")print t" "c}'; done`]).catch(() => null);
      for (const line of (r?.stdout ?? "").split("\n")) {
        const i = line.indexOf(" "), t = line.slice(0, i), dir = line.slice(i + 1).trim();
        if (i > 0 && (dir || !this.claudeEnv[t])) this.claudeEnv[t] = dir;
      }
      if (!(terminal in this.claudeEnv)) this.claudeEnv[terminal] = null;
    }
    const dir = this.claudeEnv[terminal];
    return dir === null ? null : (dir || `${home()}/.claude`);
  }

  async route(v) {
    const key = v.program.key, agent = v.program.name;
    const icon = v.program.icon, tint = v.program.tint;
    if (key === "claude" || key === "claude-code") {
      const dir = await this.claudeDirOf(v.terminal);
      const dirs = dir ? [dir] : claudeDirs.map(d => `${home()}/${d}`);
      return dirs.map(d => ({ id: `claude.${claudeLabel(d)}`, provider: "claude", agent, label: claudeLabel(d), sub: d.replace(home(), "~"), icon, tint, from: { claude: d } }));
    }
    if (key === "codex") return [{ id: "codex", provider: "codex", agent, label: "codex", sub: "ChatGPT plan", icon, tint, from: { codex: true } }];
    if (key === "copilot") return [{ id: "copilot", provider: "copilot", agent, label: "copilot", sub: "GitHub Copilot", icon, tint, from: { copilot: true } }];
    const h = HARNESS[key];
    if (!h) return [labelled(v)];
    const entry = await h.pick();
    const auth = (await json(h.auth))?.[entry];
    const provider = UNDER[entry];
    if (!provider || auth?.type !== "oauth") return [labelled(v, `${entry ?? "its provider"}: no usage API`)];
    // Same ChatGPT account as Codex's own login: share its numbers and its fresher token.
    if (provider === "codex" && auth.accountId && auth.accountId === (await json(".codex/auth.json"))?.tokens?.account_id) {
      return [{ id: "codex", provider, agent, label: key, sub: `via ${entry} (Codex login)`, icon, tint, from: { codex: true } }];
    }
    return [{ id: `${key}.${provider}`, provider, agent, label: key, sub: `via ${entry}`, icon, tint, from: { harness: key, entry } }];
  }

  // Runs when what's visible changes; keeps the last list when no agent is in view.
  sync(cx) {
    const vis = visible();
    const sig = vis.map(v => `${v.terminal}:${v.program.key}`).join(",");
    if (sig === this.sig) return;
    this.sig = sig;
    if (!vis.length) { if (shownList().length && !shared(SHOWN)?.idle) setShared(SHOWN, { list: shownList(), idle: true }); return; }
    cx.spawn(async () => {
      const seen = new Set(), list = [];
      for (const v of vis) for (const s of await this.route(v)) if (!seen.has(s.id)) { seen.add(s.id); list.push(s); }
      if (this.sig !== sig) return;
      if (JSON.stringify(shared(SHOWN)) !== JSON.stringify({ list, idle: false })) setShared(SHOWN, { list, idle: false });
      await refreshAll();
    });
  }

  render(cx) {
    if (props()?.overlay) return this.details();
    this.sync(cx);
    return props()?.compact ? this.compact() : this.bar();
  }

  // Bottom bar: popup sits above, card pinned to its bottom. Top bar: below, pinned to its top.
  open() {
    const b = this.anchor;
    const z = Number(settings()?.zoom) || 1;
    const list = shownList();
    const rows = list.reduce((n, s) => n + Math.max(1, shared(keyOf(s.id))?.windows?.length ?? 0), 0);
    const want = 80 + list.length * 75 + rows * 70;
    const below = b && b.y / z < 200;
    const height = !b || below ? want : Math.min(want, b.y / z - GAP);
    const x = b ? Math.max(0, b.x + b.width - (POPUP_W + GAP) * z) : 0;
    const at = !b ? undefined : below ? { x, y: b.y + b.height + GAP * z } : { x, y: b.y - (height + GAP) * z };
    openOverlay({ mod: MOD, kind: "popup", frame: "none", width: POPUP_W, height, at, props: { details: true, height, below } });
  }

  icon(s, size, dim) {
    if (!s.icon) return div().size(size).flex_none();
    const el = s.tint ? svg(s.icon).text_color(theme().muted) : image(s.icon);
    return el.size(size).flex_none().opacity(dim ? 0.5 : 1);
  }

  tip(s) {
    const u = shared(keyOf(s.id));
    if (s.note) return `${s.agent}: ${s.note}`;
    const ws = u?.windows ?? [];
    return `${s.agent} (${s.label}): ` + (ws.length
      ? ws.map(w => `${w.long} ${w.used}%, ${resets(w)}`).join("; ") + (u.error ? ` (${u.error})` : "")
      : u?.error ?? (u?.fetched ? "no limits reported" : "loading"));
  }

  shell(el) {
    const t = theme(), edge = props()?.border;
    return el.id("root").size_full().items_center().bg(t.chrome).overflow_hidden()
      .when(edge === "top", el => el.border_t(1).border_color(t.border))
      .when(edge === "bottom", el => el.border_b(1).border_color(t.border))
      .on_mouse_down("left", (e, cx) => { this.anchor = e.bounds; cx.stop_propagation(); })
      .on_click(() => this.open())
      .tooltip(shownList().map(s => this.tip(s)).join("\n") || "No agent in view");
  }

  bar() {
    const t = theme(), idle = shared(SHOWN)?.idle;
    const rows = shownList().map(s => {
      const u = shared(keyOf(s.id));
      const stale = idle || isStale(u);
      const ws = (u?.windows ?? []).slice(0, 2);
      return h_flex().h(19).gap(6).items_center().flex_none()
        .child(this.icon(s, 13, stale))
        .child(div().w(64).flex_none().whitespace_nowrap().font_semibold().text_color(stale ? t.dim : t.foreground).child(s.label))
        .when(Boolean(s.note) || !ws.length, el => el.child(div().text_color(t.dim).child(s.note ?? (u?.error ? "no data" : u?.fetched ? "no limits" : "…"))))
        .children(ws.map(w => h_flex().gap(4).items_center().flex_none()
          .child(div().text_color(t.dim).child(w.short))
          .child(div().w(70).child(meter(w, stale, t, 5)))
          .child(div().w(28).text_color(stale ? t.dim : w.used >= 80 ? color(w, stale, t) : t.muted).child(`${w.used}%`))
          .child(div().w(78).flex_none().whitespace_nowrap().text_size(11).text_color(!stale && w.used >= 80 ? color(w, stale, t) : t.dim).child(`↻ ${resetsShort(w)}`))));
    });
    return this.shell(h_flex()).pl(12).pr(8).gap(12).text_size(11.8).child(v_flex().gap(2).children(rows));
  }

  // 330px: one provider gets label, bar and two windows; two drop the label; more keep one window each.
  compact() {
    const t = theme(), list = shownList(), idle = shared(SHOWN)?.idle;
    const n = list.length;
    // Icon, one bar for the first window, then the next window as plain text. The popup has the rest.
    const barW = n === 1 ? 90 : n === 2 ? 60 : 40;
    const twoClaudes = list.filter(x => x.provider === "claude").length > 1;
    const segs = list.map(s => {
      const u = shared(keyOf(s.id));
      const stale = idle || isStale(u);
      const [first, second] = u?.windows ?? [];
      const pct = (w, c) => div().whitespace_nowrap().text_color(stale ? t.dim : w.used >= 80 ? c : t.muted).child(`${w.used}%`);
      return h_flex().gap(6).items_center().flex_none()
        .child(this.icon(s, 12, stale))
        .when(twoClaudes && s.provider === "claude", el => el.child(div().whitespace_nowrap().text_color(stale ? t.dim : t.foreground).child(s.label)))
        .when(Boolean(s.note) || !first, el => el.child(div().whitespace_nowrap().text_color(t.dim).child(s.note ?? (u?.error ? "no data" : u?.fetched ? "no limits" : "…"))))
        .when(Boolean(first), el => {
          const c = color(first, stale, t);
          return el.child(div().relative().w(barW).h(6).bg(t.border).child(div().absolute().left(0).top(0).h_full().w(`${clamp(first.used)}%`).bg(c)))
            .child(pct(first, c));
        })
        .when(Boolean(second), el => el.child(div().text_color(t.dim).child(second.short)).child(pct(second, color(second, stale, t))));
    });
    return this.shell(h_flex()).justify_end().px(10).gap(14).text_size(11).children(segs);
  }

  details() {
    const t = theme(), idle = shared(SHOWN)?.idle, list = shownList();
    const section = s => {
      const u = shared(keyOf(s.id));
      const stale = idle || isStale(u);
      const footer = s.note ?? (!u?.fetched ? (u?.error ?? "not fetched yet")
        : u.error ? `fetch failed: ${u.error} · data from ${clock(Date.parse(u.fetched))}`
        : `updated ${clock(Date.parse(u.fetched))}`);
      return v_flex().gap(10).p(10).rounded(6).border(1).border_color(stale ? t.border : t.input)
        .child(h_flex().gap(6).items_center()
          .child(this.icon(s, 14, stale))
          .child(div().text_size(12.5).font_bold().text_color(t.foreground).child(s.provider ? `${PROVIDERS[s.provider].name} · ${s.label}` : s.label))
          .when(Boolean(s.sub), el => el.child(div().text_size(11.5).text_color(t.dim).child(s.sub))))
        .children((u?.windows ?? []).map(w => v_flex().gap(6)
          .child(h_flex().justify_between().items_end()
            .child(div().text_color(t.foreground).child(w.long))
            .child(div().text_size(18).font_semibold().text_color(color(w, stale, t)).child(`${w.used}%`)))
          .child(meter(w, stale, t, 6))
          .child(div().text_size(11.5).text_color(t.dim).child(resets(w)))))
        .child(div().text_size(11.5).text_color(u?.error ? t.blocked : t.dim).child(footer));
    };
    return v_flex().w_full().h(props().height ?? 0).when(!props().below, el => el.justify_end()).child(v_flex().w_full().p(14).gap(14).text_size(12).text_color(t.muted)
      .bg(t.popover).border(1).border_color(t.border).rounded(8)
      .child(h_flex().justify_between().items_center()
        .child(div().text_size(13).font_semibold().text_color(t.foreground).child(idle ? "AI usage (last seen)" : "AI usage"))
        .child(div().id("refresh").px(6).py(2).rounded(5).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
          .on_click((_e, cx) => cx.spawn(async () => refreshAll(true))).child("Refresh")))
      .when(!list.length, el => el.child(div().text_color(t.dim).child("No agent in view")))
      .children(list.map(section)));
  }
}

const clamp = v => Math.min(100, Math.max(0, v ?? 0));

function pace(w) {
  const end = Date.parse(w.resets_at);
  if (!end || !w.span) return null;
  return Math.min(1, Math.max(0, 1 - (end - Date.now()) / w.span));
}

function color(w, stale, t) {
  if (stale) return t.dim;
  if (w.used >= 95) return RED;
  if (w.used >= 80) return AMBER;
  return t.accent;
}

function clock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function resets(w) {
  // The API reports resets a fraction of a second before the hour.
  const end = Math.round(Date.parse(w.resets_at) / 60e3) * 60e3;
  if (!end) return "";
  const left = Math.max(0, end - Date.now());
  if (left < DAY) {
    const h = Math.floor(left / H), m = Math.round((left % H) / 60e3);
    return `resets in ${h ? `${h}h ` : ""}${m}m, at ${clock(end)}`;
  }
  if (w.monthly) return `resets ${new Date(end).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  return `resets ${DAYS[new Date(end).getDay()]} at ${clock(end)}`;
}

function resetsShort(w) {
  const end = Math.round(Date.parse(w.resets_at) / 60e3) * 60e3;
  if (!end) return "";
  const left = Math.max(0, end - Date.now());
  if (left >= 2 * DAY) return `${Math.round(left / DAY)}d`;
  return `${Math.floor(left / H)}h ${Math.floor((left % H) / 60e3)}m`;
}

// The elapsed share of the window is drawn as a ghost fill: lit past it means running ahead of pace.
function meter(w, stale, t, height) {
  const ghost = stale ? null : pace(w);
  return div().relative().w_full().h(height).rounded(height / 2).bg(t.border)
    .when(ghost !== null, el => el.child(div().absolute().left(0).top(0).h_full().w(`${ghost * 100}%`).rounded(height / 2).bg(t.dim).opacity(0.35)))
    .child(div().absolute().left(0).top(0).h_full().w(`${clamp(w.used)}%`).rounded(height / 2).bg(color(w, stale, t)));
}
