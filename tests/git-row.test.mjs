import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../mods/omarchy-changes/main.js', import.meta.url), 'utf8');
const calls = [];
let failOn = null;
const refs = 'refs/heads/main\nrefs/heads/feat\nrefs/remotes/origin/HEAD\nrefs/remotes/origin/main\nrefs/remotes/origin/fix/x\n';
const element = new Proxy({}, { get: () => () => element });
const dependencies = {
  View: class {}, div: () => element, image: () => element, svg: () => element, v_flex: () => element, h_flex: () => element,
  InputState: { new: () => ({ on() {}, value: () => '', set_value() {} }) }, Input: { new: () => element }, Scrollbar: { vertical: () => element },
  v_virtual_list: () => element, spaces: () => [{ active: true, folder: '/repo' }], focused: () => ({}), panes: () => [],
  exec: async (cmd, args) => { calls.push(args.join(' ')); return { code: args[0] === failOn ? 1 : 0, stdout: args.includes('for-each-ref') ? refs : '', stderr: `${args[0]} broke` }; },
  readTextFile: async () => null, watchFolder: async () => {}, theme: () => ({}), settings: () => ({}),
  fileAppearance: () => ({ icon: '_file' }), gitStatus: () => 'M', statusColor: () => '#ffffff',
};
const body = source.replace(/^import .*;\n/gm, '').replace('export default class', 'return class');
const Changes = Function(...Object.keys(dependencies), body)(...Object.values(dependencies));

async function press(setup, action) {
  calls.length = 0;
  const panel = new Changes();
  let spawned;
  const cx = { spawn: (fn) => { spawned = fn(cx); }, notify() {} };
  Object.assign(panel, { root: '/repo', on: null, context: JSON.stringify({ cwd: '/repo', on: null }), files: [], message: '', input: { set_value() {} }, refresh() {} }, setup);
  action(panel, cx);
  await spawned;
  return panel;
}

failOn = 'add';
let panel = await press({ message: 'msg' }, (p, cx) => p.commit(cx));
assert.deepEqual(calls, ['add -A'], 'commit must not run after add fails');
assert.match(panel.note, /^Commit failed: add broke/);
assert.equal(panel.busy, false);

failOn = null;
await press({ sync: { upstream: false } }, (p, cx) => p.push(cx));
assert.deepEqual(calls, ['push -u origin HEAD'], 'push without upstream sets it');
await press({ sync: { upstream: true } }, (p, cx) => p.push(cx));
assert.deepEqual(calls, ['push'], 'push with upstream is plain');

panel = await press({}, (p, cx) => p.toggleBranches(cx));
assert.deepEqual(panel.branches, ['main', 'feat', 'fix/x'], 'local first, remote short names, no HEAD or duplicates');
await press({}, (p, cx) => p.switchTo('fix/x', cx));
assert.deepEqual(calls, ['switch fix/x']);

console.log('Git runner stops at the first failure; Push picks -u origin HEAD only without an upstream');
