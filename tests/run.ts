// Runs ULVim's checks and prints one line per criterion.
//   bun tests/run.ts                 all rows
//   bun tests/run.ts ISC-12 ISC-40   just those
//   bun tests/run.ts --json          machine-readable
//   bun tests/run.ts --unattended    skip rows whose script needs a live terminal
// The rows come from the table in CHECKS.md. A private criteria file (ISA.md), when present at
// the repo root, is read instead, in the same table format. A row's command cell is a backticked
// command, run from the repo root with NVIM_APPNAME=ulvim.
// A script that needs a live terminal says so with a line reading `// needs: live-terminal`.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const LIVE_TERMINAL = /^\s*\/\/ needs: live-terminal\s*$/m;

type Row = { isc: string; check: string; threshold: string; tool: string };

// Split a markdown table row on unescaped pipes; `\|` inside a cell stands for `|`.
const cells = (line: string) => line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim().replace(/\\\|/g, "|"));

// The first table in `text` whose header names an id column (isc or id) and a command
// column (tool or command).
export function parseRows(text: string): Row[] {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("|")) continue;
    const head = cells(lines[i]).map((h) => h.toLowerCase());
    const id = head.findIndex((h) => h === "isc" || h === "id");
    const cmd = head.findIndex((h) => h === "tool" || h === "command");
    if (id < 0 || cmd < 0) continue;
    const check = head.indexOf("check");
    const thr = head.indexOf("threshold");
    const rows: Row[] = [];
    for (const l of lines.slice(i + 1)) {
      if (!l.startsWith("|")) break;
      const c = cells(l);
      if (/^ISC-\d+$/.test(c[id] ?? "")) rows.push({ isc: c[id], check: check >= 0 ? c[check] : "", threshold: thr >= 0 ? c[thr] : "", tool: c[cmd] ?? "" });
    }
    return rows;
  }
  return [];
}

export function loadRows(root = ROOT): { source: string; rows: Row[] } {
  const isa = join(root, "ISA.md");
  if (existsSync(isa)) {
    const text = readFileSync(isa, "utf8");
    const start = text.indexOf("\n## Test Strategy");
    if (start < 0) return { source: "ISA.md", rows: [] };
    const end = text.indexOf("\n## ", start + 1);
    return { source: "ISA.md", rows: parseRows(text.slice(start, end < 0 ? undefined : end)) };
  }
  const checks = join(root, "CHECKS.md");
  if (existsSync(checks)) return { source: "CHECKS.md", rows: parseRows(readFileSync(checks, "utf8")) };
  return { source: "none", rows: [] };
}

// True when any repo script the command runs carries the live-terminal marker.
function needsLiveTerminal(cmd: string): boolean {
  for (const m of cmd.matchAll(/(?:^|[\s'"=])((?:\.\/)?(?:tests|scripts)\/[\w./-]+\.ts)\b/g)) {
    const path = join(ROOT, m[1]);
    if (existsSync(path) && LIVE_TERMINAL.test(readFileSync(path, "utf8"))) return true;
  }
  return false;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const only = args.filter((a) => a.startsWith("ISC-"));
  const unattended = args.includes("--unattended");
  const { source, rows } = loadRows();
  const results: { isc: string; pass: boolean; out: string; skipped?: boolean }[] = [];
  if (source === "none") results.push({ isc: "-", pass: false, out: "no ISA.md or CHECKS.md at the repo root" });
  for (const id of only) if (!rows.some((r) => r.isc === id)) results.push({ isc: id, pass: false, out: `not a row in ${source}` });
  for (const r of rows) {
    if (only.length && !only.includes(r.isc)) continue;
    const cmd = r.tool.match(/^`(.*)`$/)?.[1];
    if (!cmd) { results.push({ isc: r.isc, pass: false, out: "no runnable command" }); continue; }
    if (unattended && needsLiveTerminal(cmd)) { results.push({ isc: r.isc, pass: true, skipped: true, out: "skipped: needs a live terminal" }); continue; }
    const p = Bun.spawnSync(["zsh", "-c", cmd], { cwd: ROOT, env: { ...process.env, NVIM_APPNAME: "ulvim" }, timeout: 480_000 });
    const out = (p.stdout.toString() + p.stderr.toString()).trim().split("\n").slice(-1)[0] ?? "";
    results.push({ isc: r.isc, pass: p.exitCode === 0, out });
  }
  if (json) console.log(JSON.stringify(results));
  else {
    for (const r of results) console.log(`${r.pass ? "✓" : "✗"} ${r.isc.padEnd(8)} ${r.out.slice(0, 140)}`);
    console.log(`\n${results.filter((r) => r.pass).length}/${results.length} pass`);
  }
  process.exit(results.length > 0 && results.every((r) => r.pass) ? 0 : 1);
}
