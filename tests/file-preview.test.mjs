import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../mods/omarchy-files/main.js', import.meta.url), 'utf8');
let content = 'export const message = "hello";', editor;
const colors = { ansi5: '#ff00ff', ansi2: '#00ff00', dim: '#555555', ansi4: '#0000ff', ansi3: '#ffff00', ansi1: '#ff0000', ansi6: '#00ffff' };
const dependencies = {
  View: class {}, spaces: () => [], focused: () => ({}), panes: () => [],
  theme: () => colors, settings: () => ({ font_family: 'JetBrains Mono' }),
  readTextFile: async () => content,
  EditorState: { new: options => { editor = options; return { release() {} }; } },
};
const Files = Function(...Object.keys(dependencies), source.replace(/^import .*;\n/gm, '').replace('export default class', 'return class'))(...Object.values(dependencies));
const panel = new Files();
Object.assign(panel, { context: JSON.stringify({ on: null }), root: '/sample', on: null });
let pending;
const cx = { spawn: work => { pending = work(cx); }, notify() {} };
panel.show('app.ts', cx);
await pending;
assert.equal(editor.readonly, true);
assert.equal(editor.language, 'js');
assert.equal(editor.syntax.keyword, colors.ansi5);
assert.equal(editor.syntax.string, colors.ansi2);
assert.equal(editor.value, content);
content = 'binary\0data';
panel.show('image.png', cx);
await pending;
assert.equal(panel.code, null);
assert.match(panel.fileError, /Binary file/);
content = null;
panel.show('missing.ts', cx);
await pending;
assert.match(panel.fileError, /no longer available/);
content = 'x'.repeat(400001);
panel.show('large.txt', cx);
await pending;
assert.match(editor.value, /file truncated/);
assert.equal(editor.value.indexOf('\n'), 400000);
panel.show(null);
assert.equal(panel.code, null);
console.log('Readonly syntax preview, binary/unavailable handling, truncation and back action pass');
