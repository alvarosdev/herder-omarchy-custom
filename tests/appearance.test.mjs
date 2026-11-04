import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const theme = { ansi1: '#ff0000', ansi2: '#00ff00', ansi3: '#ffff00', ansi5: '#ff00ff', foreground: '#ffffff' };
const files = {
  'app.ts': 'typescript', 'APP.TSX': 'react-typescript', 'main.js': 'javascript',
  'app.jsx': 'react', 'main.py': 'python', 'Main.java': 'java', 'main.rs': 'rust',
  'main.go': 'go', 'package.json': 'node', 'data.json': 'json', '.env': 'config',
  '.env.local': 'config', 'README.md': 'readme', 'guide.md': 'markdown',
  'photo.png': 'image', 'logo.svg': 'svg', 'Dockerfile': 'docker',
  '.gitignore': 'git', 'config.yaml': 'yaml', 'LICENSE': 'license',
  'unknown.xyz': '_file', 'no-extension': '_file', 'tsconfig.json': 'typescript-config',
  'src/deep/file.ts': 'typescript', 'src/thing.d.ts': 'typescript-def',
};
for (const name of ['omarchy-files', 'omarchy-changes']) {
  const source = await readFile(new URL(`../mods/${name}/appearance.js`, import.meta.url), 'utf8');
  const { fileAppearance, folderAppearance, statusColor, gitStatus } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  for (const [path, icon] of Object.entries(files)) {
    assert.equal(fileAppearance(path, theme).icon, icon, `${name}: ${path}`);
    const svg = await readFile(new URL(`../mods/${name}/icons/${icon}.svg`, import.meta.url), 'utf8');
    assert.match(svg, /<svg/);
    assert.match(svg, /#[0-9a-fA-F]{3,8}/, 'Icon must retain its original palette');
  }
  if (name === 'file-changes-colors') {
    for (const [folder, icon] of Object.entries({ src: 'folder_source', components: 'folder_component', tests: 'folder_test', docs: 'folder_docs', assets: 'folder_assets', config: 'folder_config', scripts: 'folder_script', custom: '_folder' })) {
      assert.equal(folderAppearance(`project/${folder}`, false), icon);
      assert.equal(folderAppearance(`project/${folder}`, true), `${icon}_open`);
      for (const variant of [icon, `${icon}_open`]) assert.match(await readFile(new URL(`../mods/${name}/icons/${variant}.svg`, import.meta.url), 'utf8'), /<svg/);
    }
  }
  for (const xy of ['UU', 'AA', 'DD', 'AU', 'UD']) assert.equal(gitStatus(xy), 'U');
  for (const [xy, expected] of [['??', 'A'], ['A ', 'A'], [' D', 'D'], [' M', 'M'], ['  ', null]]) assert.equal(gitStatus(xy), expected);
  for (const [status, token] of [['A', 'ansi2'], ['M', 'ansi3'], ['D', 'ansi1'], ['U', 'ansi5'], [null, 'foreground']]) assert.equal(statusColor(status, theme), theme[token]);
  assert.match(await readFile(new URL(`../mods/${name}/CHARMED-LICENSE.md`, import.meta.url), 'utf8').catch(() => ''), /Copyright 2024 Littensy/);
}
console.log('Both panels: Charmed file icons, open/closed folder icons, asset palettes, attribution and Git colors pass');
