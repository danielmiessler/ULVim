// F13, pure Neovim: the nvim you run is the upstream release pinned in neovim.json.
//   bun tests/neovim_pin.ts <path|tamper>
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const pin = await Bun.file(join(ROOT, "neovim.json")).json() as { version: string };
const OPT = join(homedir(), ".local/opt/neovim");
const sh = (cmd: string) => Bun.spawnSync(["zsh", "-ic", cmd], { stdout: "pipe", stderr: "pipe" }).stdout.toString().trim();

const checks: Record<string, () => [boolean, string]> = {
  // ISC-143: what an interactive shell runs for `nvim` and `v`, by real path and version.
  path: () => {
    const first = sh("command -v nvim");
    const alias = sh("alias v");
    const real = first && existsSync(first) ? realpathSync(first) : "";
    const dir = join(OPT, `v${pin.version}`);
    if (!existsSync(dir)) return [false, `pinned v${pin.version} not installed (bun scripts/nvim-install.ts)`];
    const want = realpathSync(dir) + "/bin/nvim";
    const ver = real ? Bun.spawnSync([real, "--version"]).stdout.toString().match(/^NVIM v(\S+)/)?.[1] : undefined;
    const ok = real === want && ver === pin.version && /^v='?nvim'?$/.test(alias);
    return [ok, `nvim -> ${real || "missing"} (v${ver}); want ${want} (v${pin.version}); ${alias}`];
  },
  // ISC-144: wrong bytes are refused before anything is unpacked or linked.
  tamper: () => {
    const dir = mkdtempSync(join(tmpdir(), "ulvim-pin-"));
    try {
      const bad = join(dir, "nvim-macos-arm64.tar.gz");
      writeFileSync(bad, "not the release");
      const env = { ...process.env, ULVIM_NVIM_OPT: join(dir, "opt"), ULVIM_NVIM_BIN: join(dir, "bin") };
      const p = Bun.spawnSync(["bun", "scripts/nvim-install.ts", "--file", bad], { cwd: ROOT, env, stdout: "pipe" });
      const res = JSON.parse(p.stdout.toString() || "{}");
      const installed = existsSync(join(dir, "opt")) && readdirSync(join(dir, "opt")).some((n) => n.startsWith("v"));
      const linked = existsSync(join(dir, "bin/nvim"));
      return [p.exitCode === 1 && res.refused === "sha256 mismatch" && !installed && !linked, `exit ${p.exitCode}, ${res.refused ?? res.error}, installed ${installed}, linked ${linked}`];
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
};

const name = process.argv[2];
const check = checks[name ?? ""];
if (!check) { console.log(`usage: neovim_pin.ts <${Object.keys(checks).join("|")}>`); process.exit(2); }
const [ok, detail] = check();
console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${detail}`);
process.exit(ok ? 0 : 1);
