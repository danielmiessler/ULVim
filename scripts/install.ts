// Installs ULVim on a Mac. INSTALL.md is the agent-facing guide; this is its one command.
//   bun scripts/install.ts            run every step; safe to rerun (a step already done is left alone)
//   bun scripts/install.ts --check    report every step and change nothing
//   bun scripts/install.ts --no-nvim  skip the Neovim download (tests use this)
// Steps: tree-sitter CLI >= 0.26, the pinned Neovim (scripts/nvim-install.ts), ~/.config/nvim and
// ~/.config/ulvim linked to this repo, one source line for shell/ulvim.zsh in ~/.zshrc, and ~/.local/bin on
// PATH with the pinned nvim the one an interactive zsh runs.
// A step it will not take (an existing config in the way, a tool it does not install) is "refused"
// with the fix in "next"; nothing is overwritten. Prints one JSON line. Exit 0 all ok, 1 any step not ok.
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

class InvariantViolation extends Error {}
function invariant(cond: unknown, msg: string): asserts cond { if (!cond) throw new InvariantViolation(msg); }

type Step = { step: string; ok: boolean; changed?: boolean; detail: string; next?: string };
const ROOT = realpathSync(join(import.meta.dir, ".."));
const HOME = process.env.HOME ?? homedir();
const args = process.argv.slice(2);
const check = args.includes("--check");
const noNvim = args.includes("--no-nvim");
const SOURCE_LINE = "[[ -r ~/.config/nvim/shell/ulvim.zsh ]] && source ~/.config/nvim/shell/ulvim.zsh";
const MARKER = "# ULVim shell layer (added by bun scripts/install.ts)";
// The layer files whose names ~/.zshrc must not also define: shell/ulvim.zsh, plus shell/user.zsh when present.
const LAYERS = ["shell/ulvim.zsh", "shell/user.zsh"].map((p) => join(ROOT, p));

// Every alias and function a layer file defines at top level, read from the file itself; helpers
// whose names start with "_" (the Ctrl-Space widget) are internal and left out.
function layerNames(): string[] {
  const names = new Set<string>();
  for (const file of LAYERS) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*alias\s+([\w-]+)=/) ?? line.match(/^\s*function\s+([\w-]+)/) ?? line.match(/^\s*([\w-]+)\s*\(\)\s*\{/);
      if (m && !m[1].startsWith("_")) names.add(m[1]);
    }
  }
  return [...names];
}
const steps: Step[] = [];

function treeSitter(): Step {
  const p = Bun.spawnSync(["zsh", "-c", "command -v tree-sitter >/dev/null && tree-sitter --version"]);
  const v = p.stdout.toString().match(/(\d+)\.(\d+)\.(\d+)/);
  const ok = !!v && (Number(v[1]) > 0 || Number(v[2]) >= 26);
  return { step: "tree-sitter", ok, detail: v ? `tree-sitter ${v[0]}` : "tree-sitter CLI not found",
    ...(ok ? {} : { next: "brew install tree-sitter-cli (or brew upgrade tree-sitter-cli); 0.26 or newer" }) };
}

function neovim(): Step {
  if (noNvim) return { step: "neovim", ok: true, detail: "skipped (--no-nvim)" };
  const p = Bun.spawnSync(["bun", join(ROOT, "scripts/nvim-install.ts"), ...(check ? ["--check"] : [])], { cwd: ROOT, env: { ...process.env, HOME } });
  const line = p.stdout.toString().trim().split("\n").pop() ?? "{}";
  let res: Record<string, unknown> = {};
  try { res = JSON.parse(line); } catch { /* reported below */ }
  if (check) {
    const ok = !!res.pin && res.pin === res.installed;
    return { step: "neovim", ok, detail: `pin ${res.pin ?? "?"}, installed ${res.installed ?? "none"}`, ...(ok ? {} : { next: "bun scripts/install.ts (installs the pin)" }) };
  }
  const ok = p.exitCode === 0 && res.ok === true;
  return { step: "neovim", ok, changed: res.changed === true, detail: ok ? `Neovim ${res.version}` : `nvim-install: ${line}`,
    ...(ok ? {} : { next: "bun scripts/nvim-install.ts and read its JSON" }) };
}

function link(name: string): Step {
  const path = join(HOME, ".config", name);
  const step = `link ~/.config/${name}`;
  let stat: ReturnType<typeof lstatSync> | null = null;
  try { stat = lstatSync(path); } catch { /* absent */ }
  if (stat?.isSymbolicLink()) {
    const target = readlinkSync(path);
    const real = existsSync(path) ? realpathSync(path) : "";
    if (real === ROOT) return { step, ok: true, changed: false, detail: `-> ${target}` };
    return { step, ok: false, detail: `link points elsewhere: ${target}`, next: `mv ~/.config/${name} ~/.config/${name}.bak, then rerun` };
  }
  if (stat) return { step, ok: false, detail: "an existing config is in the way (not a link to this repo)", next: `mv ~/.config/${name} ~/.config/${name}.bak, then rerun` };
  if (check) return { step, ok: false, detail: "missing", next: "bun scripts/install.ts" };
  mkdirSync(dirname(path), { recursive: true });
  symlinkSync(ROOT, path);
  invariant(realpathSync(path) === ROOT, `${path} does not resolve to ${ROOT} after linking`);
  return { step, ok: true, changed: true, detail: `-> ${ROOT}` };
}

function zshrc(): Step {
  const path = join(HOME, ".zshrc");
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  const count = text.split("\n").filter((l) => l.trim() === SOURCE_LINE).length;
  // Names the layer defines that ~/.zshrc also defines: whichever comes later wins, so they are reported.
  const names = layerNames();
  invariant(names.length > 0, `no alias or function found in ${LAYERS[0]}`);
  const dupes = names.filter((n) => new RegExp(`^\\s*(alias ${n}=|function ${n}\\b|${n}\\s*\\(\\)\\s*\\{)`, "m").test(text));
  const note = dupes.length ? `; ~/.zshrc also defines ${dupes.join(", ")}` : "";
  const next = dupes.length ? `remove ${dupes.join(", ")} from ~/.zshrc so shell/ulvim.zsh owns them` : undefined;
  if (count >= 1) return { step: "zshrc source line", ok: dupes.length === 0, changed: false, detail: `present${count > 1 ? ` (${count} copies)` : ""}${note}`, ...(next ? { next } : {}) };
  if (check) return { step: "zshrc source line", ok: false, detail: `missing${note}`, next: "bun scripts/install.ts" };
  appendFileSync(path, `${text && !text.endsWith("\n") ? "\n" : ""}\n${MARKER}\n${SOURCE_LINE}\n`);
  const after = readFileSync(path, "utf8").split("\n").filter((l) => l.trim() === SOURCE_LINE).length;
  invariant(after === 1, `~/.zshrc holds ${after} ULVim source lines after appending`);
  return { step: "zshrc source line", ok: dupes.length === 0, changed: true, detail: `added to ~/.zshrc${note}`, ...(next ? { next } : {}) };
}

// What a new interactive zsh sees: ~/.local/bin must be on PATH, and the `nvim` it runs must be the
// pinned build under ~/.local/opt/neovim, not a Homebrew or system nvim that wins earlier on PATH.
// With --no-nvim this run does not manage Neovim, so only the PATH half is checked.
function localBin(): Step {
  const step = "~/.local/bin on PATH";
  const bin = join(HOME, ".local/bin");
  // Tagged lines, read last-first, so anything ~/.zshrc itself prints is ignored.
  const p = Bun.spawnSync(["zsh", "-ic", "print -r -- \"ULVIM_PATH=$PATH\"; print -r -- \"ULVIM_NVIM=$(whence -p nvim)\""], { env: { ...process.env, HOME }, stdout: "pipe", stderr: "ignore" });
  const out = p.stdout.toString().split("\n");
  const tagged = (tag: string) => out.findLast((l) => l.startsWith(tag))?.slice(tag.length).trim() ?? "";
  const dirs = tagged("ULVIM_PATH=").split(":").map((s) => s.trim());
  const nvimLine = tagged("ULVIM_NVIM=");
  const shellFix = "the zshrc source line must be the last PATH change in ~/.zshrc (shell/ulvim.zsh puts ~/.local/bin first): move later PATH lines above it, then open a new shell and rerun";
  const sourced = existsSync(join(HOME, ".zshrc")) && readFileSync(join(HOME, ".zshrc"), "utf8").split("\n").some((l) => l.trim() === SOURCE_LINE);
  if (!dirs.includes(bin)) return { step, ok: false, detail: "not on PATH in an interactive zsh",
    next: sourced ? shellFix : "bun scripts/install.ts (adds the zshrc source line; shell/ulvim.zsh puts ~/.local/bin first), then open a new shell" };
  if (noNvim) return { step, ok: true, detail: `on PATH (position ${dirs.indexOf(bin) + 1}); nvim not checked (--no-nvim)` };
  const pin = (JSON.parse(readFileSync(join(ROOT, "neovim.json"), "utf8")) as { version: string }).version;
  // Real paths on both sides: a home under a linked folder (/var -> /private/var) must still match.
  const optDir = join(HOME, ".local/opt/neovim");
  const pinned = join(existsSync(optDir) ? realpathSync(optDir) : optDir, `v${pin}`) + "/";
  const installPin = "bun scripts/install.ts (installs the pinned Neovim and links ~/.local/bin/nvim to it)";
  if (!nvimLine) return { step, ok: false, detail: "on PATH, but an interactive zsh finds no nvim", next: installPin };
  let real = nvimLine;
  try { real = realpathSync(nvimLine); } catch { /* reported as is */ }
  if (real.startsWith(pinned)) return { step, ok: true, detail: `on PATH; nvim is the pinned ${pin} (${nvimLine})` };
  const detail = `on PATH, but an interactive zsh runs ${nvimLine}${real !== nvimLine ? ` (${real})` : ""}, not the pinned ${pin} under ~/.local/opt/neovim`;
  // The winner sits in ~/.local/bin itself (an old or foreign link), or ~/.local/bin is first and has no nvim: install the pin.
  if (nvimLine === join(bin, "nvim") || dirs.indexOf(bin) === 0) return { step, ok: false, detail, next: installPin };
  const ahead = dirs.slice(0, dirs.indexOf(bin)).join(", ");
  return { step, ok: false, detail, next: `${ahead} come before ~/.local/bin: ${shellFix}; or remove the other nvim (brew uninstall neovim)` };
}

steps.push(treeSitter(), neovim(), link("nvim"), link("ulvim"), zshrc(), localBin());
const ok = steps.every((s) => s.ok);
console.log(JSON.stringify({ ok, mode: check ? "check" : "install", repo: ROOT, steps }));
process.exit(ok ? 0 : 1);
