// Reopening a closed tab: what each pane ran, and how to bring its agent back.
// Pure helpers; main.js does the I/O.

// One pass over /proc. A line per Claude or Codex process inside a Herdr terminal:
// terminal, pid, program, CLAUDE_CONFIG_DIR, the Codex session file it has open,
// then its command line (\x1f between arguments). The first line is the shell.
export const SCAN = `echo "shell\t\${SHELL:-sh}"
for d in /proc/[0-9]*; do
  { read -r c < "$d/comm"; } 2>/dev/null || continue
  case "$c" in claude|codex) ;; *) continue ;; esac
  e=$(tr '\\0' '\\n' < "$d/environ" 2>/dev/null) || continue
  t=$(printf '%s\\n' "$e" | sed -n 's/^HC_TERMINAL_ID=//p')
  [ -n "$t" ] || continue
  dir=$(printf '%s\\n' "$e" | sed -n 's/^CLAUDE_CONFIG_DIR=//p')
  roll=$(ls -l "$d/fd" 2>/dev/null | grep -o '/[^ ]*rollout-[^ ]*\\.jsonl' | head -n 1)
  printf '%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' "$t" "\${d#/proc/}" "$c" "$dir" "$roll" "$(tr '\\0' '\\037' < "$d/cmdline")"
done`;

export function parseScan(stdout) {
  const procs = {};
  let shell = "sh";
  for (const line of stdout.split("\n")) {
    const f = line.split("\t");
    if (f[0] === "shell") { shell = f[1] || shell; continue; }
    if (f.length < 6) continue;
    const [terminal, pid, program, dir, rollout, cmdline] = f;
    procs[terminal] = { pid, program, dir, rollout, args: cmdline.split("\x1f").filter(Boolean).slice(1) };
  }
  return { shell, procs };
}

export const quote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

// The command that brings a pane's agent back where it was. null: a plain shell.
export function resumeCommand(proc, sessionId, home) {
  if (proc?.program === "claude") {
    // Its own flags stay; an old --resume/--continue gives way to this session.
    const args = [];
    for (let i = 0; i < proc.args.length; i++) {
      const a = proc.args[i];
      if (a === "--continue" || a === "-c") continue;
      if (a === "--resume" || a === "-r") { if (proc.args[i + 1] && !proc.args[i + 1].startsWith("-")) i++; continue; }
      if (a.startsWith("--resume=")) continue;
      args.push(a);
    }
    const env = proc.dir && proc.dir !== `${home}/.claude` ? `CLAUDE_CONFIG_DIR=${quote(proc.dir)} ` : "";
    return `${env}claude ${[...args.map(quote), ...(sessionId ? ["--resume", quote(sessionId)] : ["--continue"])].join(" ")}`;
  }
  if (proc?.program === "codex") {
    const id = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/.exec(proc.rollout ?? "")?.[1];
    // No session file open yet means no conversation to resume: start it fresh.
    return id ? `codex resume ${quote(id)}` : "codex";
  }
  return null;
}

// Runs inside the person's shell, so the pane stays when the agent exits, as it was.
export const argvOf = (cmd, shell) => (cmd ? [shell, "-lc", `${cmd}; exec ${quote(shell)}`] : undefined);
