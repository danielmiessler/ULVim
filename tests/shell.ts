// Shell layer and agent install checks.
//   bun tests/shell.ts <defines|reach|install|refuse|check|doc>
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, relative } from "node:path";

const ROOT = realpathSync(join(import.meta.dir, ".."));
const LAYER = join(ROOT, "shell/ulvim.zsh");
// The names the public layer defines, no more and no fewer.
const NAMES = ["v", "vconf", "vf", "vo", "vs", "vk", "vc", "vd", "vp", "nlp", "fzp"];
const SOURCE_LINE = "[[ -r ~/.config/nvim/shell/ulvim.zsh ]] && source ~/.config/nvim/shell/ulvim.zsh";

const zsh = (script: string, env: Record<string, string> = {}, interactive = false) => {
  const p = Bun.spawnSync(["zsh", interactive ? "-ic" : "-fc", script], { env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode, out: p.stdout.toString().trim(), err: p.stderr.toString().trim() };
};
// A fresh home with a ~/.zshrc that puts ~/.local/bin on PATH, so only the steps under test differ.
function sandbox(): string {
  const home = mkdtempSync(join(tmpdir(), "ulvim-home-"));
  writeFileSync(join(home, ".zshrc"), `export PATH="$HOME/.local/bin:$PATH"\n`);
  return home;
}
const install = (home: string, ...extra: string[]) => {
  const p = Bun.spawnSync(["bun", join(ROOT, "scripts/install.ts"), "--no-nvim", ...extra], { cwd: ROOT, env: { ...process.env, HOME: home, ZDOTDIR: home }, stdout: "pipe" });
  return { code: p.exitCode, res: JSON.parse(p.stdout.toString() || "{}") as { ok: boolean; steps: { step: string; ok: boolean; changed?: boolean; detail: string; next?: string }[] } };
};
const step = (res: ReturnType<typeof install>["res"], name: string) => res.steps.find((s) => s.step === name);
const snapshot = (home: string) => JSON.stringify(["nvim", "ulvim"].map((n) => { try { const s = lstatSync(join(home, ".config", n)); return [n, s.isSymbolicLink(), s.mtimeMs]; } catch { return [n, null]; } })) + readFileSync(join(home, ".zshrc"), "utf8");

const checks: Record<string, () => [boolean, string]> = {
  // ISC-148: in a home whose ~/.config/nvim links to this repo, sourcing the layer in a clean zsh
  // defines every name; the file defines no other public name; every config path a name opens or
  // enters exists through that link.
  defines: () => {
    const home = mkdtempSync(join(tmpdir(), "ulvim-home-"));
    try {
      mkdirSync(join(home, ".config"));
      symlinkSync(ROOT, join(home, ".config/nvim"));
      const r = zsh(`source ${LAYER}; for n in ${NAMES.join(" ")}; do whence -w $n; done`, { HOME: home });
      const missing = NAMES.filter((n) => !new RegExp(`^${n}: (alias|function)$`, "m").test(r.out));
      const lines = readFileSync(LAYER, "utf8").split("\n").filter((l) => !l.trim().startsWith("#"));
      const defined = lines.map((l) => (l.match(/^\s*alias\s+([\w-]+)=/) ?? l.match(/^\s*function\s+([\w-]+)/))?.[1]).filter((n): n is string => !!n && !n.startsWith("_"));
      const extra = defined.filter((n) => !NAMES.includes(n));
      // Paths the names use: only alias and function lines, so the guarded source of an optional file is not one.
      const uses = lines.filter((l) => /^\s*(alias|function)\s/.test(l)).join("\n");
      const paths = [...uses.matchAll(/~\/(\.config\/nvim[^\s"]*)/g)].map((m) => m[1]);
      const absent = paths.filter((p) => !existsSync(join(home, p)));
      const ok = r.code === 0 && !r.err && missing.length === 0 && extra.length === 0 && paths.length > 0 && absent.length === 0;
      return [ok, `${NAMES.length - missing.length}/${NAMES.length} defined${missing.length ? ` (missing ${missing})` : ""}; ${extra.length} other names${extra.length ? ` (${extra})` : ""}; ${paths.length} config paths, ${absent.length} absent${absent.length ? ` (${absent})` : ""}${r.err ? `; stderr: ${r.err}` : ""}`];
    } finally { rmSync(home, { recursive: true, force: true }); }
  },
  // ISC-149: the layer reaches the repo only through the ~/.config/nvim link and never requires a module.
  reach: () => {
    const src = readFileSync(LAYER, "utf8").split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
    // Repo paths: this checkout's own location (absolute, or relative to home unless it is the
    // link itself), and any absolute home path. Derived at run time, so no folder is named here.
    const rel = relative(homedir(), ROOT);
    const named = [ROOT, ...(!rel.startsWith("..") && rel !== ".config/nvim" ? [rel] : [])];
    const repoPaths = named.reduce((n, p) => n + src.split(p).length - 1, 0) + (src.match(/\/(?:Users|home)\//g) ?? []).length;
    const requires = (src.match(/require\s*\(?\s*["']ulvim/g) ?? []).length + (src.match(/lua\s+require/g) ?? []).length;
    return [repoPaths === 0 && requires === 0, `${repoPaths} repo paths, ${requires} requires`];
  },
  // ISC-150: a fresh home gets both links and one source line; a second run changes nothing.
  install: () => {
    const home = sandbox();
    try {
      const a = install(home);
      const before = snapshot(home);
      const b = install(home);
      const lines = readFileSync(join(home, ".zshrc"), "utf8").split("\n").filter((l) => l.trim() === SOURCE_LINE).length;
      const links = ["nvim", "ulvim"].every((n) => realpathSync(join(home, ".config", n)) === ROOT);
      const rerunQuiet = b.res.steps.every((s) => !s.changed) && snapshot(home) === before;
      const live = zsh("alias vf; whence -w fzp", { HOME: home, ZDOTDIR: home }, true);
      const ok = a.code === 0 && b.code === 0 && links && lines === 1 && rerunQuiet && /vf=/.test(live.out) && /fzp: function/.test(live.out);
      return [ok, `exit ${a.code}/${b.code}, links ${links}, source lines ${lines}, rerun changed nothing ${rerunQuiet}, shell sees layer ${/fzp: function/.test(live.out)}`];
    } finally { rmSync(home, { recursive: true, force: true }); }
  },
  // ISC-151: an existing real config is refused and left byte-for-byte alone.
  refuse: () => {
    const home = sandbox();
    try {
      const dir = join(home, ".config/nvim");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "init.lua"), "-- someone else's config\n");
      const r = install(home);
      const s = step(r.res, "link ~/.config/nvim");
      const kept = !lstatSync(dir).isSymbolicLink() && readFileSync(join(dir, "init.lua"), "utf8") === "-- someone else's config\n";
      const ok = r.code === 1 && s?.ok === false && /mv ~\/\.config\/nvim/.test(s?.next ?? "") && kept;
      return [ok, `exit ${r.code}, step ok ${s?.ok}, next "${s?.next}", kept ${kept}`];
    } finally { rmSync(home, { recursive: true, force: true }); }
  },
  // ISC-152: --check names all six steps and changes nothing.
  check: () => {
    const home = sandbox();
    try {
      const before = snapshot(home);
      const r = install(home, "--check");
      const names = r.res.steps.map((s) => s.step);
      const want = ["tree-sitter", "neovim", "link ~/.config/nvim", "link ~/.config/ulvim", "zshrc source line", "~/.local/bin on PATH"];
      const all = want.every((w) => names.includes(w));
      const unchanged = snapshot(home) === before && !existsSync(join(home, ".config/nvim"));
      return [all && unchanged, `${names.length} steps (${all ? "all six" : "missing some"}), unchanged ${unchanged}`];
    } finally { rmSync(home, { recursive: true, force: true }); }
  },
  // ISC-153: INSTALL.md gives an agent the outcome, the command, the check, and the refusals.
  doc: () => {
    const f = join(ROOT, "INSTALL.md");
    if (!existsSync(f)) return [false, "no INSTALL.md"];
    const t = readFileSync(f, "utf8");
    const parts: Record<string, boolean> = {
      agent: /written for the agent/i.test(t),
      outcome: /## Done looks like/.test(t),
      command: /bun scripts\/install\.ts\n/.test(t),
      check: /bun scripts\/install\.ts --check/.test(t),
      refusals: /## When a step is not ok/.test(t) && ["tree-sitter", "neovim", "link ~/.config/nvim", "zshrc source line", "~/.local/bin on PATH"].every((s) => t.includes(s)),
      names: NAMES.every((n) => t.includes(`\`${n}\``)),
    };
    const miss = Object.entries(parts).filter(([, v]) => !v).map(([k]) => k);
    return [miss.length === 0, miss.length ? `missing: ${miss}` : "outcome, command, check, refusals, all names"];
  },
};

const name = process.argv[2] ?? "";
const fn = checks[name];
if (!fn) { console.log(`usage: bun tests/shell.ts <${Object.keys(checks).join("|")}>`); process.exit(2); }
const [ok, msg] = fn();
console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${msg}`);
process.exit(ok ? 0 : 1);
