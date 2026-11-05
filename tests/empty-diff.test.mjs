import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../mods/omarchy-changes/main.js', import.meta.url), 'utf8');
let virtualLists = 0;
const element = new Proxy({}, { get: (_target, name) => name === 'when' ? (condition, apply) => condition ? apply(element) : element : () => element });
const builder = () => element;
const dependencies = {
  View: class {}, div: builder, svg: builder, v_flex: builder, h_flex: builder,
  Input: { new: builder }, Scrollbar: { vertical: builder },
  v_virtual_list: () => { virtualLists++; return element; },
  spaces: () => [], focused: () => ({}), panes: () => [], theme: () => ({}), settings: () => ({}),
  props: () => ({}), shared: () => undefined, setShared: () => {}, run: () => {},
};
const Changes = Function(...Object.keys(dependencies), source.replace(/^import .*;\n/gm, '').replace('export default class', 'return class'))(...Object.values(dependencies));
const panel = new Changes();
Object.assign(panel, { files: [], rows: [], context: JSON.stringify({ on: null }), message: '', diffWidth: 300 });
panel.render({});
assert.equal(virtualLists, 0, 'Empty diff must not materialize a virtual list: Herdr check has no current native view');
console.log('Empty diff renders without virtual-list native state');
