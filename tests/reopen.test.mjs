import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resumeCommand, argvOf } from '../mods/omarchy-tabs/reopen.js';

const procs = {
  t1: { program: 'claude', dir: '/home/me/.claude-personal', args: ['--dangerously-skip-permissions', '--resume', 'old-id'] },
  t2: { program: 'codex', session: '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b', args: [] },
  t3: { program: 'claude', args: [] },
};

test('a closed tab\'s agents come back in their own session and profile', () => {
  assert.equal(resumeCommand(procs.t1, 'new-id', '/home/me'),
    "CLAUDE_CONFIG_DIR='/home/me/.claude-personal' claude '--dangerously-skip-permissions' --resume 'new-id'");
  assert.equal(resumeCommand(procs.t2, procs.t2.session, '/home/me'), "codex resume '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'");
  // No saved conversation: don't accidentally continue another terminal's session.
  assert.equal(resumeCommand(procs.t3, null, '/home/me'), 'claude');
  assert.equal(resumeCommand(undefined, null, '/home/me'), null);
});

test('a resumed agent runs in the shell, which stays when it exits', () => {
  assert.deepEqual(argvOf("claude --continue", '/bin/bash'), ['/bin/bash', '-lc', "claude --continue; exec '/bin/bash'"]);
  assert.equal(argvOf(null, '/bin/bash'), undefined);
});

test('a Codex with no session yet starts fresh, not someone else\'s last session', () => {
  assert.equal(resumeCommand({ program: 'codex', args: [] }, null, '/home/me'), 'codex');
});

test('Codex keeps safety, model and profile flags when resuming its exact session', () => {
  const proc = { program: 'codex', dir: '/custom/codex', args: ['--yolo', '-p', 'work', '-m', 'test-model', 'old prompt'] };
  assert.equal(resumeCommand(proc, 'session-id', '/home/me'),
    "CODEX_HOME='/custom/codex' codex resume '--yolo' '-p' 'work' '-m' 'test-model' 'session-id'");
});

test('Pi reopens its session file and keeps launch options without replaying its prompt', () => {
  const proc = { program: 'pi', args: ['--provider', 'openai-codex', '--thinking', 'medium', '--session', '/old.jsonl', 'old prompt'] };
  assert.equal(resumeCommand(proc, '/sessions/current.jsonl', '/home/me'),
    "pi '--provider' 'openai-codex' '--thinking' 'medium' --session '/sessions/current.jsonl'");
});

test('Claude drops an initial prompt and old session flags when restoring', () => {
  const proc = { program: 'claude', args: ['--dangerously-skip-permissions', '--resume=old', 'old prompt'] };
  assert.equal(resumeCommand(proc, 'current', '/home/me'),
    "claude '--dangerously-skip-permissions' --resume 'current'");
});

test('Codex keeps approval values even though Pi uses the same short flag as a switch', () => {
  assert.equal(resumeCommand({ program: 'codex', args: ['-a', 'never', '-c', 'model_reasoning_effort="high"'] }, 'id', '/home/me'),
    "codex resume '-a' 'never' '-c' 'model_reasoning_effort=\"high\"' 'id'");
});
