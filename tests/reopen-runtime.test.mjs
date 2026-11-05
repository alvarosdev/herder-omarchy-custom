import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { argvOf } from '../mods/omarchy-tabs/reopen.js';

test('session matching separates simultaneous agents in one cwd and ignores older conversations', () => {
  execFileSync('python3', ['-c', `
import runpy
m = runpy.run_path('mods/omarchy-tabs/reopen.py')
pick = m['match_session']
sessions = [
    {'id': 'old', 'cwd': '/repo', 'created': 1},
    {'id': 'other', 'cwd': '/elsewhere', 'created': 101},
    {'id': 'first', 'cwd': '/repo', 'created': 102},
    {'id': 'second', 'cwd': '/repo', 'created': 112},
]
assert pick({'cwd': '/repo', 'started': 100}, sessions)['id'] == 'first'
assert pick({'cwd': '/repo', 'started': 110}, sessions)['id'] == 'second'
assert pick({'cwd': '/repo', 'started': 200}, sessions) is None
`]);
});

test('two near-simultaneous agents cannot claim the same session file', () => {
  execFileSync('python3', ['-c', `
import runpy
pick = runpy.run_path('mods/omarchy-tabs/reopen.py')['match_session']
sessions = [{'id': 'one', 'cwd': '/repo', 'created': 101}, {'id': 'two', 'cwd': '/repo', 'created': 102}]
assert pick({'cwd': '/repo', 'started': 100.5}, sessions, {'one'})['id'] == 'two'
`]);
});

test('restoring a tree keeps nested axes, weights, pane order and mod props with fresh IDs', () => {
  execFileSync('python3', ['-c', `
import runpy
m = runpy.run_path('mods/omarchy-tabs/reopen.py')
root = {'id': 'old-tab', 'type': 'row', 'children': [
    {'id': 'p1', 'type': 'block', 'size': {'weight': 3}, 'content': {'terminal': 't1'}},
    {'id': 'split', 'type': 'column', 'size': {'weight': 2}, 'children': [
        {'id': 'p2', 'type': 'block', 'size': {'weight': 1}, 'content': {'terminal': 't2'}},
        {'id': 'p3', 'type': 'block', 'size': {'weight': 4}, 'content': {'mod': 'files', 'props': {'folder': '/repo'}}},
    ]},
]}
new = m['restore_tree'](root, {'t1': 't101', 't2': 't102'}, 'new-tab')
assert new['id'] == 'new-tab'
assert new['children'][0]['content'] == {'terminal': 't101'}
assert new['children'][0]['size'] == {'weight': 3}
assert new['children'][1]['type'] == 'column'
assert new['children'][1]['children'][0]['content'] == {'terminal': 't102'}
assert new['children'][1]['children'][1]['content']['props'] == {'folder': '/repo'}
assert new['children'][1]['children'][1]['size'] == {'weight': 4}
assert root['children'][0]['content']['terminal'] == 't1'
assert new['children'][1]['id'] != root['children'][1]['id']
`]);
});

test('Pi launch options survive the app shell wrapper and a second reopen', () => {
  execFileSync('python3', ['-c', `
import runpy
args = runpy.run_path('mods/omarchy-tabs/reopen.py')['launch_args']
assert args(['/bin/bash', '-lc', "pi --thinking medium --session '/sessions/one.jsonl'; exec '/bin/bash'"], 'pi') == ['--thinking', 'medium', '--session', '/sessions/one.jsonl']
`]);
});

test('Codex keeps its explicit session when resume flags precede the ID', () => {
  execFileSync('python3', ['-c', `
import runpy
pick = runpy.run_path('mods/omarchy-tabs/reopen.py').get('session_argument', lambda *_: None)
assert pick('codex', ['resume', '--yolo', '--no-daemon', '01a1a996-7d9e-78e0-bf5f-ebc5e1c0959d']) == '01a1a996-7d9e-78e0-bf5f-ebc5e1c0959d'
assert pick('pi', ['--session=/sessions/current.jsonl']) == '/sessions/current.jsonl'
`]);
});

for (const source of [undefined, 'python source']) test(`reopen falls back to app commands when ${source ? 'Python or hc connect fails' : 'the helper cannot load'}`, async () => {
  const calls = [], tasks = [];
  const saved = { space: 'space', name: 'closed', shell: '/bin/bash', panes: [{ cwd: '/one', cmd: 'pi --session file' }, { cwd: '/two', cmd: null }] };
  const context = {
    View: class {}, argvOf,
    shared: () => [saved], setShared: () => {},
    spaces: () => [{ id: 'space' }],
    run: (...args) => calls.push(args), notify: () => {},
    exec: async () => { throw new Error('dependency unavailable'); },
  };
  const code = readFileSync('mods/omarchy-tabs/main.js', 'utf8').replace(/^import .*;\n/gm, '').replace('export default class Tabs', 'globalThis.Tabs = class Tabs');
  vm.runInNewContext(code, context);
  const tabs = new context.Tabs();
  tabs.source = source;
  tabs.reopen({ spawn: fn => tasks.push(fn({ notify() {} })) });
  await Promise.all(tasks);
  assert.deepEqual(calls.map(c => c[0]), ['tab.new', 'terminal.open']);
  assert.equal(calls[0][1].space, 'space');
  assert.equal(calls[0][1].folder, '/one');
  assert.equal(calls[1][1].folder, '/two');
});
