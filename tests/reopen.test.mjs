import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseScan, resumeCommand, argvOf } from '../mods/omarchy-tabs/reopen.js';

const scan = [
  'shell\t/bin/bash',
  't1\t100\tclaude\t/home/me/.claude-personal\t\tclaude\x1f--dangerously-skip-permissions\x1f--resume\x1fold-id',
  't2\t200\tcodex\t\t/home/me/.codex/sessions/2026/11/04/rollout-2026-11-04T10-00-00-0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b.jsonl\tcodex',
  't3\t300\tclaude\t\t\tclaude',
].join('\n');

test('a closed tab\'s agents come back in their own session and profile', () => {
  const { shell, procs } = parseScan(scan);
  assert.equal(shell, '/bin/bash');
  assert.equal(resumeCommand(procs.t1, 'new-id', '/home/me'),
    "CLAUDE_CONFIG_DIR='/home/me/.claude-personal' claude '--dangerously-skip-permissions' --resume 'new-id'");
  assert.equal(resumeCommand(procs.t2, null, '/home/me'), "codex resume '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'");
  // Default profile and no session file: the folder's last conversation.
  assert.equal(resumeCommand(procs.t3, null, '/home/me'), 'claude --continue');
  assert.equal(resumeCommand(undefined, null, '/home/me'), null);
});

test('a resumed agent runs in the shell, which stays when it exits', () => {
  assert.deepEqual(argvOf("claude --continue", '/bin/bash'), ['/bin/bash', '-lc', "claude --continue; exec '/bin/bash'"]);
  assert.equal(argvOf(null, '/bin/bash'), undefined);
});

test('a Codex with no session yet starts fresh, not someone else\'s last session', () => {
  assert.equal(resumeCommand({ program: 'codex', rollout: '', args: [] }, null, '/home/me'), 'codex');
});
