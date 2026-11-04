import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import * as core from "../mods/omarchy-mod-manager/core.js";

const io = {
  async exec(cmd, args, opts) {
    if (cmd === "herdr-app") return { code: args[1].endsWith("/broken") ? 1 : 0, stdout: "", stderr: "SyntaxError (test)" };
    const r = spawnSync(cmd, args, { cwd: opts?.cwd, encoding: "utf8" });
    return { code: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  },
  async readText(path) {
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  },
  async writeText(path, text) {
    writeFileSync(path, text);
  },
};

function put(root, files) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

function repo(files) {
  const dir = mkdtempSync(join(tmpdir(), "mm-repo-"));
  put(dir, files);
  const git = (...a) => execFileSync("git", ["-C", dir, ...a], { stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "x");
  return { dir, commit: (more) => { put(dir, more); git("add", "-A"); git("-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "y"); } };
}

function home(keys = { global: { "cmd-p": "mod.open:picker" } }) {
  const dir = mkdtempSync(join(tmpdir(), "mm-home-"));
  put(dir, {
    "keys.json": JSON.stringify(keys, null, 2),
    "installed.json": JSON.stringify({ agents: {}, picker: {} }),
    "mods/agents/main.js": "",
    "mods/picker/main.js": "",
    "mods/mine/main.js": "",
    "layouts/main.json": "{}",
  });
  return dir;
}

const keys = (dir) => JSON.parse(readFileSync(join(dir, "keys.json"), "utf8"));

test("finds packages at the root, in subfolders, with several mods and with layouts", () => {
  const pkgs = core.findPackages([
    "README.md", "RECIPE.md", "preview.png", "keys.json",
    "mods/jump/main.js", "mods/jump/mod.json", "mods/jump/icon.svg", "mods/spaces-jump/main.js",
    "github-panel/RECIPE.md", "github-panel/mods/github/main.js", "github-panel/mods/issue/main.js",
    "board/layouts/board.json", "board/layouts/board.svg", "board/mods/board/main.js",
    "notes/mods/x/README.md",
  ]);
  assert.deepEqual(pkgs.map((p) => [p.prefix, p.name, p.mods, p.recipe, p.keys]), [
    ["", "jump + spaces-jump", ["jump", "spaces-jump"], true, true],
    ["board", "board", ["board"], false, false],
    ["github-panel", "github-panel", ["github", "issue"], true, false],
  ]);
  assert.deepEqual(pkgs[0].files, ["mods/jump/main.js", "mods/jump/mod.json", "mods/jump/icon.svg", "mods/spaces-jump/main.js"]);
  assert.deepEqual(pkgs[1].layouts, ["board/layouts/board.json", "board/layouts/board.svg"]);
});

test("flags programs, network and files in the sources", () => {
  const risks = core.scanRisks([
    { path: "a/main.js", text: "const r = await exec('git', ['status']); await fetch(url)" },
    { path: "b/main.js", text: "readTextFile(p); writeTextFile(p, t)" },
    { path: "c/main.js", text: "div().child('exec is a word'); cx.spawn(async () => refresh())" },
  ]);
  assert.deepEqual(risks, [
    { label: "runs programs", paths: ["a/main.js"] },
    { label: "reaches the network", paths: ["a/main.js"] },
    { label: "reads files", paths: ["b/main.js"] },
    { label: "writes files", paths: ["b/main.js"] },
  ]);
});

test("installs, keeps the person's keys, checks, updates and uninstalls a package", async () => {
  const src = repo({
    "RECIPE.md": "# x",
    "keys.json": JSON.stringify({ global: { "cmd-j": "jump.open", "cmd-p": "mod.open:jump" } }),
    "mods/jump/main.js": "exec('ls')",
    "mods/jump/mod.json": "{}",
  });
  const app = home();
  const cache = join(app, ".cache");
  let fetched = await core.fetchSource(io, src.dir, cache);
  let [pkg] = core.findPackages(fetched.files);
  const list = async (records) => (await core.listMods(io, { appHome: app, records })).map((m) => m.name);
  let plan = await core.planInstall(io, { appHome: app, dir: fetched.dir, pkg, record: null, existingMods: await list([]), existingLayouts: ["main.json"] });
  assert.deepEqual(plan.clashes, []);
  assert.deepEqual(plan.keyAdds, [{ section: "global", key: "cmd-j", action: "jump.open" }]);
  assert.deepEqual(plan.keyConflicts, [{ section: "global", key: "cmd-p", action: "mod.open:jump", current: "mod.open:picker" }]);
  assert.deepEqual(plan.risks.map((r) => r.label), ["runs programs"]);

  let record = await core.applyInstall(io, { appHome: app, plan, source: src.dir, prefix: pkg.prefix, sha: fetched.sha });
  assert.equal(readFileSync(join(app, "mods/jump/main.js"), "utf8"), "exec('ls')");
  assert.deepEqual(keys(app).global, { "cmd-p": "mod.open:picker", "cmd-j": "jump.open" });
  assert.deepEqual(record.keys, [{ section: "global", key: "cmd-j", action: "jump.open" }]);
  assert.deepEqual(record.risks, ["runs programs"], "the approved risks are kept, so a bulk update can spot new ones");
  assert.deepEqual(await core.checkMods(io, app, record.mods), []);
  const mods = await core.listMods(io, { appHome: app, records: [record] });
  assert.deepEqual(mods.map((m) => [m.name, m.kind]), [["jump", "installed"], ["mine", "local"], ["agents", "herdr"], ["picker", "herdr"]]);

  src.commit({ "mods/jump/main.js": "v2", "keys.json": JSON.stringify({ global: { "cmd-j": "jump.toggle" } }) });
  assert.notEqual(await core.remoteSha(io, src.dir), record.sha);
  fetched = await core.fetchSource(io, src.dir, cache);
  [pkg] = core.findPackages(fetched.files);
  plan = await core.planInstall(io, { appHome: app, dir: fetched.dir, pkg, record, existingMods: await list([record]), existingLayouts: [] });
  assert.deepEqual(plan.clashes, [], "an update is not a clash with itself");
  assert.deepEqual(plan.keyAdds, [{ section: "global", key: "cmd-j", action: "jump.toggle" }], "its own untouched key follows the package");
  record = await core.applyInstall(io, { appHome: app, plan, source: src.dir, prefix: pkg.prefix, sha: fetched.sha, record });
  assert.equal(readFileSync(join(app, "mods/jump/main.js"), "utf8"), "v2");
  assert.equal(keys(app).global["cmd-j"], "jump.toggle");

  await core.uninstall(io, { appHome: app, record });
  assert.ok(!existsSync(join(app, "mods/jump")));
  assert.deepEqual(keys(app).global, { "cmd-p": "mod.open:picker" });
  assert.ok(existsSync(join(app, "mods/mine/main.js")), "other mods stay");
});

test("an update never takes back a key the person rebound", async () => {
  const src = repo({ "keys.json": JSON.stringify({ global: { "cmd-j": "jump.open" } }), "mods/jump/main.js": "" });
  const app = home({ global: { "cmd-j": "my.thing" } });
  const record = { source: src.dir, prefix: "", sha: "old", mods: ["jump"], layouts: [], keys: [{ section: "global", key: "cmd-j", action: "jump.open" }] };
  put(app, { "mods/jump/main.js": "" });
  const fetched = await core.fetchSource(io, src.dir, join(app, ".cache"));
  const [pkg] = core.findPackages(fetched.files);
  const plan = await core.planInstall(io, { appHome: app, dir: fetched.dir, pkg, record, existingMods: ["jump"], existingLayouts: [] });
  assert.deepEqual(plan.keyAdds, []);
  assert.equal(plan.keyConflicts[0].current, "my.thing");
  await core.uninstall(io, { appHome: app, record });
  assert.equal(keys(app).global["cmd-j"], "my.thing", "uninstall keeps a rebound key");
});

test("never overwrites a mod or layout it did not install", async () => {
  const src = repo({ "mods/mine/main.js": "theirs", "layouts/main.json": "{\"x\":1}" });
  const app = home();
  const fetched = await core.fetchSource(io, src.dir, join(app, ".cache"));
  const [pkg] = core.findPackages(fetched.files);
  const plan = await core.planInstall(io, { appHome: app, dir: fetched.dir, pkg, record: null, existingMods: ["mine"], existingLayouts: ["main.json"] });
  assert.deepEqual(plan.clashes, ["mods/mine", "layouts/main.json"]);
  await assert.rejects(core.applyInstall(io, { appHome: app, plan, source: src.dir, prefix: "", sha: fetched.sha }), /already exists/);
  assert.equal(readFileSync(join(app, "mods/mine/main.js"), "utf8"), "");
});

test("installs a package from a subfolder with its layout", async () => {
  const src = repo({ "board/RECIPE.md": "", "board/mods/board/main.js": "b", "board/layouts/board.json": "{}", "other/mods/o/main.js": "" });
  const app = home();
  const fetched = await core.fetchSource(io, src.dir, join(app, ".cache"));
  const pkg = core.findPackages(fetched.files).find((p) => p.prefix === "board");
  const plan = await core.planInstall(io, { appHome: app, dir: fetched.dir, pkg, record: null, existingMods: [], existingLayouts: [] });
  const record = await core.applyInstall(io, { appHome: app, plan, source: src.dir, prefix: "board", sha: fetched.sha });
  assert.deepEqual([record.mods, record.layouts], [["board"], ["board.json"]]);
  assert.ok(existsSync(join(app, "layouts/board.json")));
  assert.ok(!existsSync(join(app, "mods/o")), "only the chosen package");
});

test("reports a mod that fails herdr-app check", async () => {
  const app = home();
  assert.deepEqual(await core.checkMods(io, app, ["ok", "broken"]), [{ mod: "broken", error: "SyntaxError (test)" }]);
});

test("removing a local symlinked mod only unlinks it", async () => {
  const app = home();
  const target = mkdtempSync(join(tmpdir(), "mm-target-"));
  put(target, { "main.js": "keep me" });
  symlinkSync(target, join(app, "mods/linked"));
  const mods = await core.listMods(io, { appHome: app, records: [] });
  assert.equal(mods.find((m) => m.name === "linked").symlink, true);
  await core.removeLocal(io, { appHome: app, name: "linked", symlink: true });
  assert.throws(() => lstatSync(join(app, "mods/linked")));
  assert.equal(readFileSync(join(target, "main.js"), "utf8"), "keep me");
});

test("repoUrl maps owner/repo to GitHub and keeps URLs and paths", () => {
  assert.equal(core.repoUrl("dev-gvs/herdr-claude-usage"), "https://github.com/dev-gvs/herdr-claude-usage.git");
  assert.equal(core.repoUrl("/tmp/x"), "/tmp/x");
  assert.equal(core.repoUrl("https://example.com/x.git"), "https://example.com/x.git");
});

test("market search goes through gh, and anonymously when gh fails", async () => {
  const calls = [];
  const item = { full_name: "a/b", description: null, stargazers_count: 3, pushed_at: "2026-10-01T00:00:00Z", html_url: "https://github.com/a/b" };
  const viaGh = { exec: async (cmd, args) => { calls.push([cmd, ...args].join(" ")); return { code: 0, stdout: JSON.stringify({ total_count: 1500, items: [item] }), stderr: "" }; } };
  const r = await core.searchMarket(viaGh, { query: " jump ", sort: "updated", page: 2 }, () => assert.fail("no anonymous call"));
  assert.equal(r.total, 1000);
  assert.deepEqual(r.items, [{ fullName: "a/b", description: "", stars: 3, pushedAt: "2026-10-01T00:00:00Z", url: "https://github.com/a/b" }]);
  assert.match(calls[0], /-f q=topic:herdr-mod jump -f sort=updated .* -f page=2/);

  const noGh = { exec: async () => { throw new Error("gh not found"); } };
  let asked = null;
  const r2 = await core.searchMarket(noGh, {}, async (url) => { asked = url; return { status: 200, text: JSON.stringify({ total_count: 1, items: [item] }) }; });
  assert.equal(r2.items.length, 1);
  assert.match(asked, /q=topic%3Aherdr-mod&sort=stars/);
  await assert.rejects(
    core.searchMarket(noGh, {}, async () => ({ status: 403, text: JSON.stringify({ message: "API rate limit exceeded" }) })),
    /403: API rate limit exceeded \(gh: gh not found\)/,
  );
});
